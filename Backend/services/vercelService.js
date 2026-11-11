const fetch = globalThis.fetch;

const isConfigured = () => {
  return Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID);
};

const getVercelConfig = () => {
  const {
    VERCEL_TOKEN,
    VERCEL_PROJECT_ID,
    VERCEL_TEAM_ID
  } = process.env;

  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    return null;
  }

  return {
    token: VERCEL_TOKEN,
    projectId: VERCEL_PROJECT_ID,
    teamId: VERCEL_TEAM_ID,
    headers: {
      'Authorization': `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    }
  };
};

/**
 * Add a domain to the Vercel project
 */
const addDomain = async (domainName) => {
  const config = getVercelConfig();
  if (!config) {
    return { skipped: true, message: "Vercel not configured (VPS mode)" };
  }

  const url = `https://api.vercel.com/v9/projects/${config.projectId}/domains${config.teamId ? `?teamId=${config.teamId}` : ''}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify({ name: domainName })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Vercel] addDomain failed:`, data);
      throw new Error(data.error?.message || "Failed to add domain to Vercel");
    }

    return data;
  } catch (err) {
    console.error("[Vercel] Error in addDomain:", err);
    throw err;
  }
};

/**
 * Remove a domain from the Vercel project
 */
const removeDomain = async (domainName) => {
  const config = getVercelConfig();
  if (!config) {
    return { skipped: true, message: "Vercel not configured (VPS mode)" };
  }

  const url = `https://api.vercel.com/v9/projects/${config.projectId}/domains/${domainName}${config.teamId ? `?teamId=${config.teamId}` : ''}`;

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: config.headers
    });

    const data = await response.json();

    if (!response.ok && response.status !== 404) {
      console.error(`[Vercel] removeDomain failed:`, data);
      throw new Error(data.error?.message || "Failed to remove domain from Vercel");
    }

    return data;
  } catch (err) {
    console.error("[Vercel] Error in removeDomain:", err);
    throw err;
  }
};

/**
 * Check the status of a domain on Vercel
 */
const checkDomainStatus = async (domainName) => {
  const config = getVercelConfig();
  if (!config) {
    return { status: 'Pending', message: "Vercel not configured (VPS mode)" };
  }

  const baseUrl = `https://api.vercel.com/v9/projects/${config.projectId}/domains/${domainName}`;
  const teamParam = config.teamId ? `?teamId=${config.teamId}` : '';

  try {
    // 1. Get Domain Info
    const domainRes = await fetch(`${baseUrl}${teamParam}`, { headers: config.headers });
    const domainData = await domainRes.json();

    if (!domainRes.ok) {
      return { status: 'Error', message: domainData.error?.message || "Domain not found on Vercel" };
    }

    // 2. Get Domain Config (DNS status)
    const configRes = await fetch(`${baseUrl}/config${teamParam}`, { headers: config.headers });
    const configData = await configRes.json();

    const isVerified = domainData.verified === true;
    const dnsMisconfigured = configData.misconfigured === true;

    if (isVerified && !dnsMisconfigured) {
      return { status: 'Verified' };
    } else if (dnsMisconfigured) {
      return { status: 'Pending', message: 'DNS misconfigured' };
    } else {
      return { status: 'Pending', message: 'Waiting for verification' };
    }
  } catch (err) {
    console.error("[Vercel] Error in checkDomainStatus:", err);
    return { status: 'Error', message: err.message };
  }
};

module.exports = {
  isConfigured,
  addDomain,
  removeDomain,
  checkDomainStatus,
};
