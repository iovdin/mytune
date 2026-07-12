const {GoogleAuth} = require('google-auth-library');
const path = require("path");


const auth = new GoogleAuth({
  keyFile: path.resolve(__dirname, 'google-key.json'),
  scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
});

function padLeft(value, width) {
  return String(value ?? '').padStart(width, ' ');
}

function padRight(value, width) {
  return String(value ?? '').padEnd(width, ' ');
}

function isNumeric(value) {
  return value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));
}

function toSqliteTable(data) {
  if (!data || !Array.isArray(data.rows)) {
    return JSON.stringify(data, null, 2);
  }

  const rows = data.rows;
  const keyCount = Math.max(0, ...rows.map(r => Array.isArray(r.keys) ? r.keys.length : 0));
  const keyHeaders = Array.from({length: keyCount}, (_, i) => `key${i + 1}`);

  const metricHeaders = [];
  const metricCandidates = ['clicks', 'impressions', 'ctr', 'position'];
  for (const name of metricCandidates) {
    if (rows.some(r => Object.prototype.hasOwnProperty.call(r, name))) {
      metricHeaders.push(name);
    }
  }

  const headers = [...keyHeaders, ...metricHeaders];
  if (!headers.length) {
    return JSON.stringify(data, null, 2);
  }

  const tableRows = rows.map(row => {
    const keys = Array.isArray(row.keys) ? row.keys : [];
    const keyValues = Array.from({length: keyCount}, (_, i) => keys[i] ?? '');
    const metrics = metricHeaders.map(name => row[name] ?? '');
    return [...keyValues, ...metrics];
  });

  const numericCols = headers.map((_, i) => tableRows.every(r => isNumeric(r[i])));

  const widths = headers.map((header, i) => {
    const maxCell = Math.max(
      header.length,
      ...tableRows.map(r => String(r[i] ?? '').length)
    );
    return maxCell;
  });

  const formatCell = (value, i) => {
    return numericCols[i]
      ? padLeft(value ?? '', widths[i])
      : padRight(value ?? '', widths[i]);
  };

  const headerLine = headers.map((h, i) => padRight(h, widths[i])).join('  ');
  const separatorLine = widths.map(w => '-'.repeat(w)).join('  ');
  const rowLines = tableRows.map(r =>
    r.map((cell, i) => formatCell(cell, i)).join('  ')
  );

  return [headerLine, separatorLine, ...rowLines].join('\n');
}

module.exports = async function gs({ endpoint = 'searchAnalytics/query', method = 'POST', text, site }, ctx) {

  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  const encodedSiteUrl = encodeURIComponent(site);
  const cleanEndpoint = String(endpoint || '').replace(/^\/+/, '');
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/${cleanEndpoint}`;

  let body;
  if (text && text.trim()) {
    try {
      body = JSON.parse(text);
    } catch (err) {
      return `Invalid JSON in text: ${err.message}\n${text}`;
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const fetchOptions = {
    method: method.toUpperCase(),
    headers,
  };

  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  const res = await fetch(url, fetchOptions);

  const responseText = await res.text();
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    return `HTTP ${res.status} ${res.statusText}\n${responseText}`;
  }

  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(responseText);
      return toSqliteTable(parsed);
    } catch (_) {
      return responseText;
    }
  }

  return responseText;
};
