const {GoogleAuth} = require('google-auth-library');
const path = require("path")

const auth = new GoogleAuth({
  keyFile: path.resolve(__dirname, 'google-key.json'),
  scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
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

  const dimensionHeaders = (data.dimensionHeaders || []).map(h => h.name);
  const metricHeaders = (data.metricHeaders || []).map(h => h.name);
  const headers = [...dimensionHeaders, ...metricHeaders];

  if (!headers.length) {
    return JSON.stringify(data, null, 2);
  }

  const rows = data.rows.map(row => {
    const dims = (row.dimensionValues || []).map(v => v.value);
    const metrics = (row.metricValues || []).map(v => v.value);
    return [...dims, ...metrics];
  });

  const numericCols = headers.map((_, i) => rows.every(r => isNumeric(r[i])));

  const widths = headers.map((header, i) => {
    const maxCell = Math.max(
      header.length,
      ...rows.map(r => String(r[i] ?? '').length)
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
  const rowLines = rows.map(r =>
    r.map((cell, i) => formatCell(cell, i)).join('  ')
  );

  return [headerLine, separatorLine, ...rowLines].join('\n');
}

module.exports = async function ga4({ endpoint, method = "POST", text, prop }, ctx) {
  // resolve property name to ID, or use directly if it's already an ID

  // Get access token from the service account key file
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  // GA4 API uses colon notation: properties/PROP_ID:reportMethod
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${prop}:${endpoint}`;

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
