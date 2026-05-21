const fetch = globalThis.fetch; // Use native fetch

const getZendeskConfig = () => {
  const {
    ZENDESK_SUBDOMAIN,
    ZENDESK_EMAIL,
    ZENDESK_API_TOKEN,
    ZENDESK_BASE_URL,
  } = process.env;

  if (!ZENDESK_EMAIL || !ZENDESK_API_TOKEN) {
    console.warn("[Zendesk] Missing ZENDESK_EMAIL or ZENDESK_API_TOKEN");
    return null;
  }

  // Normalize Base URL
  let baseUrl = ZENDESK_BASE_URL;
  if (!baseUrl && ZENDESK_SUBDOMAIN) {
    baseUrl = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;
  }

  if (!baseUrl) {
    console.warn("[Zendesk] Missing ZENDESK_BASE_URL and ZENDESK_SUBDOMAIN");
    return null;
  }

  // Ensure /api/v2 is present
  if (!baseUrl.includes('/api/v2')) {
    baseUrl = baseUrl.replace(/\/$/, '') + '/api/v2';
  }

  const authHeader = `Basic ${Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`).toString('base64')}`;
  
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    }
  };
};


/**
 * Creates a ticket in Zendesk
 */
const createTicket = async ({ subject, description, name, email, tags = [], type, status, priority }) => {
  const config = getZendeskConfig();
  if (!config) {
    console.warn("[Zendesk] API credentials missing, skipping Zendesk ticket creation");
    return null;
  }

  try {
    const ticketPayload = {
      subject,
      comment: { body: description },
      requester: { name, email },
      tags,
    };

    if (type) ticketPayload.type = type;
    if (status) ticketPayload.status = status;
    if (priority) ticketPayload.priority = priority;

    const response = await fetch(`${config.baseUrl}/tickets.json`, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify({
        ticket: ticketPayload
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Zendesk] createTicket failed: ${response.status} ${errorText}`);
      throw new Error(`Zendesk API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.ticket;
  } catch (err) {
    console.error("[Zendesk] Error in createTicket:", err);
    throw err;
  }
};

/**
 * Fetches tickets from Zendesk (for admin viewing)
 * Includes sideloading to get requester details.
 */
const getTickets = async () => {
  const config = getZendeskConfig();
  if (!config) return [];

  try {
    // Sideload users to get requester names and emails
    const response = await fetch(`${config.baseUrl}/tickets.json?include=users&sort_by=updated_at&sort_order=desc`, {
      headers: config.headers
    });

    if (!response.ok) {
      throw new Error(`Zendesk API error: ${response.statusText}`);
    }

    const data = await response.json();
    const tickets = data.tickets || [];
    const users = data.users || [];

    // Map user ID to user object for easy lookup
    const userMap = users.reduce((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});

    // Attach requester info to each ticket
    return tickets.map(ticket => ({
      ...ticket,
      requester: userMap[ticket.requester_id] || { name: 'Unknown', email: 'N/A' }
    }));
  } catch (err) {
    console.error("[Zendesk] Error in getTickets:", err);
    throw err;
  }
};

/**
 * Fetches ticket statistics
 */
const getStats = async () => {
  const config = getZendeskConfig();
  if (!config) {
    return { total: 0, open: 0, resolved: 0, pending: 0 };
  }

  try {
    const response = await fetch(`${config.baseUrl}/tickets/count.json`, {
      headers: config.headers
    });

    if (!response.ok) {
      throw new Error(`Zendesk API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    // As a simple demonstration, count total tickets from Zendesk.
    // In a real scenario, you could use Zendesk Search API for accurate status counts,
    // but the `count.json` API retrieves total tickets.
    // For specific scopes (open, pending, resolved), one typically queries:
    // `/search.json?query=type:ticket status:open`
    const fetchStatusCount = async (status) => {
      const res = await fetch(`${config.baseUrl}/search.json?query=type:ticket status:${status}`, {
        headers: config.headers
      });
      if (res.ok) {
        const result = await res.json();
        return result.count || 0;
      }
      return 0;
    };

    const [openCount, resolvedCount, pendingCount] = await Promise.all([
      fetchStatusCount('open'),
      fetchStatusCount('solved'),
      fetchStatusCount('pending')
    ]);

    return {
      total: data.count?.value || 0,
      open: openCount,
      resolved: resolvedCount,
      pending: pendingCount
    };
  } catch (err) {
    console.error("[Zendesk] Error in getStats:", err);
    return { total: 0, open: 0, resolved: 0, pending: 0 };
  }
};

/**
 * Fetches comments (messages) for a specific Zendesk ticket
 */
const getTicketComments = async (ticketId) => {
  const config = getZendeskConfig();
  if (!config) return [];

  try {
    const response = await fetch(`${config.baseUrl}/tickets/${ticketId}/comments.json?include=users`, {
      headers: config.headers
    });

    if (!response.ok) {
      throw new Error(`Zendesk API error: ${response.statusText}`);
    }

    const data = await response.json();
    const comments = data.comments || [];
    const users = data.users || [];

    const userMap = users.reduce((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});

    return comments.map(comment => ({
      ...comment,
      author: userMap[comment.author_id] || { name: 'Unknown' }
    }));
  } catch (err) {
    console.error("[Zendesk] Error in getTicketComments:", err);
    throw err;
  }
};

/**
 * Fetches a single ticket from Zendesk
 */
const getTicket = async (ticketId) => {
  const config = getZendeskConfig();
  if (!config) return null;

  try {
    const response = await fetch(`${config.baseUrl}/tickets/${ticketId}.json`, {
      headers: config.headers
    });

    if (!response.ok) {
      throw new Error(`Zendesk API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.ticket;
  } catch (err) {
    console.error("[Zendesk] Error in getTicket:", err);
    throw err;
  }
};

/**
 * Adds a comment (message) to a Zendesk ticket
 */
const addTicketComment = async (ticketId, body, isPublic = true, authorId = null) => {
  const config = getZendeskConfig();
  if (!config) throw new Error("Zendesk config missing");

  try {
    const response = await fetch(`${config.baseUrl}/tickets/${ticketId}.json`, {
      method: 'PUT',
      headers: config.headers,
      body: JSON.stringify({
        ticket: {
          comment: {
            body,
            public: isPublic === true,
            ...(authorId ? { author_id: authorId } : {})
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Zendesk API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.ticket;
  } catch (err) {
    console.error("[Zendesk] Error in addTicketComment:", err);
    throw err;
  }
};

module.exports = {
  createTicket,
  getTickets,
  getTicket,
  getStats,
  getTicketComments,
  addTicketComment,
};
