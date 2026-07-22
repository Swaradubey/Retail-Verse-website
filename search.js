const searchWiki = async (query, domain) => {
  const res = await fetch('https://' + domain + '/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(query) + '&srnamespace=6&format=json');
  const data = await res.json();
  return data.query.search.map(r => r.title);
};

searchWiki('Ajio', 'en.wikipedia.org').then(res => console.log(JSON.stringify(res, null, 2)));
