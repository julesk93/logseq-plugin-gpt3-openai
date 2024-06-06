// const puppeteer = require('puppeteer');
// const cheerio = require('cheerio');

// async function fetchHtmlContent(url) {
//   const browser = await puppeteer.launch({
//     args: ['--no-sandbox', '--disable-setuid-sandbox'],
//   });
//   const page = await browser.newPage();
//   await page.goto(url, { waitUntil: 'networkidle2' });
//   const htmlContent = await page.content();
//   await browser.close();
//   return htmlContent;
// }

// function extractTextFromHTML(htmlContent) {
//   const $ = cheerio.load(htmlContent);
//   return $.text();
// }

// async function fetchAndExtract(url) {
//   const htmlContent = await fetchHtmlContent(url);
//   return extractTextFromHTML(htmlContent);
// }

// module.exports = { fetchAndExtract };

// import fetch from 'node-fetch';

// export async function getHTMLContent(url: string): Promise<string> {
//   const response = await fetch(url);
//   const html = await response.text();
//   return html;
// }
