const fetch = require('node-fetch');

exports.handler = async function (event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };

  // Debug environment variables
  console.log('Environment check:', {
    hasApiKey: !!process.env.TRIPADVISOR_API_KEY,
    nodeEnv: process.env.NODE_ENV
  });

  if (!process.env.TRIPADVISOR_API_KEY) {
    console.error('TripAdvisor API key is missing');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'API configuration error' })
    };
  }

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
    console.log('Request body:', parsedBody);

    // Handle details request
    if (parsedBody.fetchDetails && parsedBody.locationId) {
      const detailsUrl = `https://api.content.tripadvisor.com/api/v1/location/${parsedBody.locationId}/details?key=${process.env.TRIPADVISOR_API_KEY}&language=en&currency=USD`;
      console.log('Making TripAdvisor Details Request:', detailsUrl.replace(process.env.TRIPADVISOR_API_KEY, 'MASKED'));

      const detailsResponse = await fetch(detailsUrl, {
        headers: { 'Accept': 'application/json' }
      });

      if (!detailsResponse.ok) {
        const errorText = await detailsResponse.text();
        console.error('TripAdvisor Details Error:', errorText);
        throw new Error(`TripAdvisor Details API error: ${detailsResponse.status}`);
      }

      const detailsData = await detailsResponse.json();
      console.log('Details found for location:', parsedBody.locationId);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: detailsData })
      };
    }

    // Handle search request
    const { name, latitude, longitude } = parsedBody;
    if (!name || !latitude || !longitude) {
      throw new Error('Missing required parameters');
    }

    const searchUrl = `https://api.content.tripadvisor.com/api/v1/location/search?key=${process.env.TRIPADVISOR_API_KEY}&searchQuery=${encodeURIComponent(name)}&latLong=${latitude},${longitude}&radius=5&radiusUnit=km&language=en`;
    console.log('Making TripAdvisor Search Request:', searchUrl.replace(process.env.TRIPADVISOR_API_KEY, 'MASKED'));

    const searchResponse = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json' }
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('TripAdvisor Search Error:', errorText);
      throw new Error(`TripAdvisor API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    console.log('Search results:', searchData);

    if (!searchData.data || searchData.data.length === 0) {
      console.log('No results found for:', name);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: null })
      };
    }

    // Get the first result and fetch its details
    const location = searchData.data[0];
    const detailsUrl = `https://api.content.tripadvisor.com/api/v1/location/${location.location_id}/details?key=${process.env.TRIPADVISOR_API_KEY}&language=en&currency=USD`;

    const detailsResponse = await fetch(detailsUrl, {
      headers: { 'Accept': 'application/json' }
    });

    if (!detailsResponse.ok) {
      const errorText = await detailsResponse.text();
      console.error('TripAdvisor Details Error:', errorText);
      throw new Error(`TripAdvisor Details API error: ${detailsResponse.status}`);
    }

    const detailsData = await detailsResponse.json();

    // Combine search and details data
    const enrichedData = {
      ...location,
      details: detailsData
    };

    console.log('Found and enriched data for:', name);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: enrichedData })
    };

  } catch (error) {
    console.error('TripAdvisor Proxy Error:', error.message, error.stack);

    if (error.message === 'Missing required parameters') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: error.message })
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
