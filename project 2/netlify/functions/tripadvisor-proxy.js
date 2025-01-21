const fetch = require('node-fetch');

exports.handler = async function (event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };

  // Debug environment variables and request
  console.log('Function invoked with:', {
    method: event.httpMethod,
    path: event.path,
    headers: event.headers,
    body: event.body ? JSON.parse(event.body) : null
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
    console.log('Processing request with body:', parsedBody);

    // Handle details request
    if (parsedBody.fetchDetails && parsedBody.locationId) {
      const detailsUrl = `https://api.content.tripadvisor.com/api/v1/location/${parsedBody.locationId}/details?key=${process.env.TRIPADVISOR_API_KEY}&language=en&currency=USD`;
      console.log('Making TripAdvisor Details Request for ID:', parsedBody.locationId);

      const detailsResponse = await fetch(detailsUrl, {
        headers: { 'Accept': 'application/json' }
      });

      const responseText = await detailsResponse.text();
      console.log('Raw details response:', responseText);

      if (!detailsResponse.ok) {
        console.error('TripAdvisor Details Error:', responseText);
        throw new Error(`TripAdvisor Details API error: ${detailsResponse.status}`);
      }

      const detailsData = JSON.parse(responseText);
      console.log('Parsed details data:', detailsData);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: detailsData })
      };
    }

    // Handle search request
    const { name, latitude, longitude, type } = parsedBody;
    if (!latitude || !longitude) {
      throw new Error('Missing required parameters');
    }

    // If no specific name is provided, return empty result
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

    const searchResponse = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json' }
    });

    const searchResponseText = await searchResponse.text();
    console.log('Raw search response:', searchResponseText);

    if (!searchResponse.ok) {
      console.error('TripAdvisor Search Error:', searchResponseText);
      throw new Error(`TripAdvisor API error: ${searchResponse.status}`);
    }

    const searchData = JSON.parse(searchResponseText);
    console.log('Parsed search data:', searchData);

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

    const detailsResponseText = await detailsResponse.text();
    console.log('Raw details response:', detailsResponseText);

    if (!detailsResponse.ok) {
      console.error('TripAdvisor Details Error:', detailsResponseText);
      throw new Error(`TripAdvisor Details API error: ${detailsResponse.status}`);
    }

    const detailsData = JSON.parse(detailsResponseText);
    console.log('Parsed details data:', detailsData);

    // Combine search and details data
    const enrichedData = {
      ...location,
      details: detailsData
    };

    console.log('Final enriched data for:', name, enrichedData);

    const response = {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: enrichedData })
    };

    console.log('Sending response:', response);
    return response;

  } catch (error) {
    console.error('TripAdvisor Proxy Error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

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
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
