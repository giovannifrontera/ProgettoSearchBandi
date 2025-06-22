const axios = require('axios');
const cheerio = require('cheerio');
const mysql = require('mysql2/promise');
const dbConfig = require('../db/config');
// node-fetch is ESM only from v3. If using CommonJS, stick to v2 or use axios.
// For this project, axios is already a dependency.

const TYPICAL_PATHS = ['/albo-pretorio', '/bandi-gara', '/gare', '/avvisi', '/concorsi', '/determine-a-contrarre'];
const KEYWORDS = [/bando/i, /gara/i, /avviso/i, /concorso/i, /determina\s+a\s+contrarre/i, /selezione/i, /affidamento/i];
const DEADLINE_PATTERNS = [
    /scade\s+il\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /scadenza:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /termine\s+presentazione\s+domande:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /data\s+scadenza:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
];
const PUBLISH_DATE_PATTERNS = [
    /pubblicato\s+il\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /data\s+pubblicazione:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
];

// Helper to parse Italian dates like DD/MM/YYYY or DD-MM-YYYY
function parseItalianDate(dateString) {
    if (!dateString) return null;
    const parts = dateString.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (!parts) return null;

    let day = parseInt(parts[1], 10);
    let month = parseInt(parts[2], 10);
    let year = parseInt(parts[3], 10);

    if (year < 100) { // Handle YY format
        year += 2000; // Assuming 21st century
    }

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;


    // Format to YYYY-MM-DD for MySQL
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}


async function getDbConnection() {
  return await mysql.createConnection(dbConfig);
}

async function fetchPage(url, timeout = 15000) {
  console.log(`Fetching ${url}...`);
  try {
    const response = await axios.get(url, {
      timeout: timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 SchoolTenderFinderBot/1.0'
      }
    });
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.warn(`Timeout fetching ${url}`);
    } else if (error.response) {
      console.warn(`Error fetching ${url}: Status ${error.response.status}`);
    } else {
      console.warn(`Error fetching ${url}: ${error.message}`);
    }
    return null; // Return null on error to allow processing to continue for other URLs/schools
  }
}

function extractTenderInfo(html, baseUrl, schoolId) {
  const $ = cheerio.load(html);
  const tenders = [];
  const now = new Date();

  // Search in links (<a>) and articles (<article>, <div> with common classes)
  $('a, article, .item, .post, .entry, .news-item, .avviso, .bando').each((i, element) => {
    const el = $(element);
    let title = '';
    let itemUrl = '';
    let textContent = '';

    if (element.tagName === 'a') {
      title = el.text().trim();
      itemUrl = el.attr('href');
    } else { // For article, div, etc.
      title = el.find('h1, h2, h3, .title, .entry-title').first().text().trim();
      if (!title) title = el.find('a').first().text().trim(); // Fallback to first link text if no explicit title
      itemUrl = el.find('a').first().attr('href');
      textContent = el.text();
    }

    if (!title && itemUrl) { // If title is empty but URL exists, try to get title from URL filename
        try {
            const urlObj = new URL(itemUrl, baseUrl);
            const pathParts = urlObj.pathname.split('/');
            const lastPart = pathParts[pathParts.length - 1];
            if (lastPart) {
                title = decodeURIComponent(lastPart.replace(/\.(pdf|doc|docx|zip|p7m)$/i, '').replace(/_/g, ' '));
            }
        } catch (e) { /* ignore invalid URL for title generation */ }
    }


    if (!title || !KEYWORDS.some(keyword => keyword.test(title) || keyword.test(textContent))) {
      return; // Skip if no title or no keywords match
    }

    if (itemUrl) {
      try {
        itemUrl = new URL(itemUrl, baseUrl).href;
      } catch (e) {
        console.warn(`Invalid URL found for "${title}": ${itemUrl}`);
        itemUrl = null; // Or skip this tender
      }
    }

    // If itemUrl is not a direct PDF/document, it might be a page containing the tender.
    // For simplicity here, we assume itemUrl is the direct link or the most relevant link.
    // A more advanced crawler might navigate to this itemUrl if it's an HTML page.

    let deadline = null;
    let publish_date = null;
    const fullText = title + ' ' + textContent + ' ' + el.html(); // Search in title, text content and raw HTML of element

    for (const pattern of DEADLINE_PATTERNS) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        deadline = parseItalianDate(match[1]);
        if (deadline) break;
      }
    }

    for (const pattern of PUBLISH_DATE_PATTERNS) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        publish_date = parseItalianDate(match[1]);
        if (publish_date) break;
      }
    }

    // Basic type detection (can be improved)
    let type = 'Bando'; // Default
    if (/avviso/i.test(title)) type = 'Avviso';
    if (/concorso/i.test(title)) type = 'Concorso';
    if (/determina/i.test(title)) type = 'Determina';
    if (/gara/i.test(title)) type = 'Gara';


    if (itemUrl) { // Only add if we have a URL for the tender
        tenders.push({
            school_id: schoolId,
            title: title.substring(0, 499),
            type: type,
            deadline: deadline,
            publish_date: publish_date,
            url: itemUrl,
            summary: textContent.substring(0, 250) + (textContent.length > 250 ? '...' : ''), // Short summary
            last_checked: now
        });
    }
  });

  return tenders;
}

async function saveTenders(connection, tenders) {
  if (tenders.length === 0) return 0;

  const query = `
    INSERT INTO tenders (school_id, title, type, deadline, publish_date, url, summary, last_checked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      type = VALUES(type),
      deadline = VALUES(deadline),
      publish_date = VALUES(publish_date),
      summary = VALUES(summary),
      last_checked = VALUES(last_checked);
  `;

  let insertedOrUpdatedCount = 0;
  for (const tender of tenders) {
    try {
      const [result] = await connection.execute(query, [
        tender.school_id,
        tender.title,
        tender.type,
        tender.deadline,
        tender.publish_date,
        tender.url,
        tender.summary,
        tender.last_checked
      ]);
      if (result.affectedRows > 0 || result.insertId > 0) {
        insertedOrUpdatedCount++;
      }
    } catch (error) {
      // Check for specific error codes, e.g., ER_DATA_TOO_LONG for tender.url
      if (error.code === 'ER_DATA_TOO_LONG' && error.message.includes("'url'")) {
          console.warn(`URL too long for school_id ${tender.school_id}, title "${tender.title}". URL: ${tender.url.substring(0,100)}... Skipping.`);
      } else if (error.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' && (error.message.includes("'deadline'") || error.message.includes("'publish_date'"))) {
          console.warn(`Invalid date format for school_id ${tender.school_id}, title "${tender.title}". Dates: deadline=${tender.deadline}, publish_date=${tender.publish_date}. Setting to NULL.`);
          // Retry with null dates if appropriate, or just log and skip
          try {
            await connection.execute(query, [
                tender.school_id,
                tender.title,
                tender.type,
                error.message.includes("'deadline'") ? null : tender.deadline,
                error.message.includes("'publish_date'") ? null : tender.publish_date,
                tender.url,
                tender.summary,
                tender.last_checked
            ]);
            insertedOrUpdatedCount++;
          } catch (retryError) {
            console.error(`Error inserting/updating tender (after date fix attempt) for school_id ${tender.school_id}, title "${tender.title}": ${retryError.message}`);
          }
      }
      else {
        console.error(`Error inserting/updating tender for school_id ${tender.school_id}, title "${tender.title}": ${error.message}`);
      }
    }
  }
  return insertedOrUpdatedCount;
}


async function scanSchool(school) {
  if (!school || !school.id || !school.sito_web) {
    console.warn('Invalid school object provided to scanSchool:', school);
    return { school_id: school.id, name: school.denominazione, status: 'error', message: 'Sito web mancante o non valido.', found_tenders: 0 };
  }

  let mainSiteUrl;
  try {
    mainSiteUrl = new URL(school.sito_web.startsWith('http') ? school.sito_web : `http://${school.sito_web}`);
  } catch (e) {
    console.warn(`Invalid base URL for school ${school.denominazione} (${school.sito_web}): ${e.message}`);
    return { school_id: school.id, name: school.denominazione, status: 'error', message: 'URL sito web non valido.', found_tenders: 0 };
  }

  const baseHttpUrl = `http://${mainSiteUrl.hostname}`;
  const baseHttpsUrl = `https://${mainSiteUrl.hostname}`;


  let connection;
  let totalFoundTenders = 0;

  try {
    connection = await getDbConnection();
    const urlsToScan = new Set(); // Use a Set to avoid duplicate paths for http/https variations

    // Try HTTPS first, then HTTP for the base site itself
    urlsToScan.add(baseHttpsUrl);
    urlsToScan.add(baseHttpUrl);

    for (const path of TYPICAL_PATHS) {
      urlsToScan.add(`${baseHttpsUrl}${path}`);
      urlsToScan.add(`${baseHttpUrl}${path}`);
    }

    // Also scan the provided sito_web URL directly if it's different from base URLs
    if (mainSiteUrl.href !== baseHttpUrl && mainSiteUrl.href !== baseHttpsUrl) {
        urlsToScan.add(mainSiteUrl.href);
    }


    for (const url of Array.from(urlsToScan)) {
      const html = await fetchPage(url);
      if (html) {
        const tenders = extractTenderInfo(html, url, school.id);
        if (tenders.length > 0) {
          console.log(`Found ${tenders.length} potential tenders on ${url}`);
          const savedCount = await saveTenders(connection, tenders);
          totalFoundTenders += savedCount;
        }
      }
    }
    console.log(`Finished scanning ${school.denominazione}. Found ${totalFoundTenders} new/updated tenders.`);
    return { school_id: school.id, name: school.denominazione, status: 'success', found_tenders: totalFoundTenders };

  } catch (error) {
    console.error(`Error scanning school ${school.denominazione} (ID: ${school.id}): ${error.message}`);
    return { school_id: school.id, name: school.denominazione, status: 'error', message: error.message, found_tenders: totalFoundTenders };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

module.exports = { scanSchool };

// // Example Usage (for testing directly):
// if (require.main === module) {
//   (async () => {
//     // Create a dummy school object that matches your DB schema for testing
//     const dummySchool = {
//       id: 1, // Ensure this ID exists in your 'schools' table if FK is checked
//       denominazione: 'Liceo Test Maria Rossi',
//       sito_web: 'http://www.liceomariarossi.edu.it' // Replace with a real school website for testing
//       // sito_web: 'https://www.iisbafile.edu.it/web/' // Example of a school with albo pretorio
//       // sito_web: 'http://www.convittocicognini.it' // Albo online / bandi di gara
//     };

//     // Make sure your DB is running and 'schools' table has the school.id or disable FK checks for test.
//     // Or, insert a dummy school record before running:
//     // const conn = await getDbConnection();
//     // try {
//     //   await conn.execute("INSERT IGNORE INTO schools (id, codice_mecc, denominazione, sito_web) VALUES (?, ?, ?, ?)",
//     //     [dummySchool.id, 'TESTSCH01', dummySchool.denominazione, dummySchool.sito_web]
//     //   );
//     // } catch (e) { console.log("Error inserting dummy school", e.message)}
//     // await conn.end();

//     const result = await scanSchool(dummySchool);
//     console.log('Scan Result:', result);
//   })();
// }
