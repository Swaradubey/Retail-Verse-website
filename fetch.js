const getUrl = async (filename, domain) => {
  const res = await fetch('https://' + domain + '/w/api.php?action=query&titles=File:' + filename + '&prop=imageinfo&iiprop=url&format=json');
  const data = await res.json();
  const pages = data.query.pages;
  const pageId = Object.keys(pages)[0];
  if(pageId === '-1') return null;
  return pages[pageId].imageinfo[0].url;
};

const run = async () => {
  const urls = [];
  urls.push(await getUrl('Zepto_Logo.svg', 'commons.wikimedia.org'));
  await new Promise(r => setTimeout(r, 1000));
  urls.push(await getUrl('Nykaa_New_Logo.svg', 'commons.wikimedia.org'));
  console.log(urls);
};
run();
