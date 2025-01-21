const fetch = require('node-fetch');

// Simple in-memory cache (will reset on function cold starts)
const cache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

// Rate limiting
const RETRY_DELAY = 1000; // 1 second
const MAX_RETRIES = 3;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function makeRequest(url, options, retryCount = 0) {
  try {
    const response = await fetch(url, options);

    if (response.status === 429 && retryCount < MAX_RETRIES) {
      console.log(`Rate limited, retrying in ${RETRY_DELAY}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await delay(RETRY_DELAY);
      return makeRequest(url, options, retryCount + 1);
    }

    const responseText = await response.text();
    // Only log the status code and URL, not the full response
    console.log(`Response status ${response.status} for ${url}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} - ${responseText}`);
    }

    const data = JSON.parse(responseText);
    // Log a summary of the data instead of the full response
    console.log('Response summary:', {
      url,
      status: response.status,
      hasData: !!data,
      dataLength: data.data?.length
    });

    return data;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.log(`Request failed, retrying... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await delay(RETRY_DELAY);
      return makeRequest(url, options, retryCount + 1);
    }
    throw error;
  }
}

function getCacheKey(params) {
  return JSON.stringify(params);
}

function getFromCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('Cache hit:', key);
    return cached.data;
  }
  return null;
}

function setInCache(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

exports.handler = async function (event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };

  // Debug environment variables and request
  console.log('Function environment:', {
    nodeEnv: process.env.NODE_ENV,
    hasTripadvisorKey: !!process.env.TRIPADVISOR_API_KEY,
    functionName: context.functionName,
    functionVersion: context.functionVersion
  });

  // Verify API key
  if (!process.env.TRIPADVISOR_API_KEY) {
    console.error('TripAdvisor API key is missing in environment');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'API configuration error',
        details: 'TripAdvisor API key is not configured'
      })
    };
  }

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const parsedBody = JSON.parse(event.body);
    // Only log essential request info
    console.log('Processing request:', {
      type: parsedBody.fetchDetails ? 'details' : 'search',
      name: parsedBody.name,
      locationId: parsedBody.locationId
    });

    // Check cache first
    const cacheKey = getCacheKey(parsedBody);
    const cachedResult = getFromCache(cacheKey);
    if (cachedResult) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: cachedResult })
      };
    }

    // Handle details request
    if (parsedBody.fetchDetails && parsedBody.locationId) {
      const detailsUrl = `https://api.content.tripadvisor.com/api/v1/location/${parsedBody.locationId}/details?key=${process.env.TRIPADVISOR_API_KEY}&language=en&currency=USD`;
      console.log('Making TripAdvisor Details Request for ID:', parsedBody.locationId);

      const detailsData = await makeRequest(detailsUrl, {
        headers: { 'Accept': 'application/json' }
      });

      setInCache(cacheKey, detailsData);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: detailsData })
      };
    }

    // Handle search request
    const { name, latitude, longitude, type } = parsedBody;
    if (!latitude || !longitude) {
      throw new Error('Missing required parameters: latitude and longitude');
    }

    if (!name) {
      console.log('No restaurant name provided');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: null })
      };
    }

    const searchUrl = `https://api.content.tripadvisor.com/api/v1/location/search?key=${process.env.TRIPADVISOR_API_KEY}&searchQuery=${encodeURIComponent(name)}&latLong=${latitude},${longitude}&radius=5&radiusUnit=km&language=en`;
    console.log('Making TripAdvisor Search Request for:', name);

    const searchData = await makeRequest(searchUrl, {
      headers: { 'Accept': 'application/json' }
    });

    if (!searchData.data || searchData.data.length === 0) {
      console.log('No results found for:', name);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: null })
      };
    }

    // Find the best matching result
    const results = searchData.data;
    const bestMatch = results.find(location => {
      // Check if names are very similar
      const normalizedSearchName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normalizedLocationName = location.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalizedSearchName === normalizedLocationName;
    }) || results[0];

    // Get details for the best match
    const detailsUrl = `https://api.content.tripadvisor.com/api/v1/location/${bestMatch.location_id}/details?key=${process.env.TRIPADVISOR_API_KEY}&language=en&currency=USD`;
    const detailsData = await makeRequest(detailsUrl, {
      headers: { 'Accept': 'application/json' }
    });

    const enrichedData = {
      ...bestMatch,
      details: detailsData
    };

    setInCache(cacheKey, enrichedData);
    console.log('Final enriched data summary:', {
      name,
      locationId: enrichedData.location_id,
      hasDetails: !!enrichedData.details
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: enrichedData })
    };
  } catch (error) {
    console.error('Function error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    if (error.message.includes('Missing required parameters')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Bad Request',
          message: error.message
        })
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
