const https = require('https');
const fs = require('fs');
const path = require('path');

const logos = {
  'amazon.svg': 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg',
  'shopify.svg': 'https://upload.wikimedia.org/wikipedia/commons/0/0e/Shopify_logo_2018.svg',
  'woocommerce.svg': 'https://upload.wikimedia.org/wikipedia/commons/9/9d/WooCommerce_logo.svg',
  'flipkart.svg': 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Flipkart_logo.svg',
  'ondc.png': 'https://upload.wikimedia.org/wikipedia/en/thumb/4/42/Open_Network_for_Digital_Commerce_logo.svg/512px-Open_Network_for_Digital_Commerce_logo.svg.png'
};

const dir = path.join(__dirname, 'Frontend', 'public', 'marketplace-logos');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

function download(url, filename) {
  return new Promise((resolve, reject) => {
    const dest = path.join(dir, filename);
    const file = fs.createWriteStream(dest);

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    };

    const request = https.get(url, options, function(response) {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
        download(response.headers.location, filename).then(resolve).catch(reject);
      } else if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', function() {
          file.close(() => resolve());
        });
      } else {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
      }
    }).on('error', function(err) {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  for (const [filename, url] of Object.entries(logos)) {
    try {
      await download(url, filename);
      console.log(`Downloaded ${filename}`);
    } catch (err) {
      console.error(`Error downloading ${filename}: ${err.message}`);
    }
  }
}

run();
