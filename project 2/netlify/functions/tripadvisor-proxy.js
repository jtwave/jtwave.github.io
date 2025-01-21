const fetch = require('node-fetch');

exports.handler = async function(event, context) {
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

  let name, latitude, longitude;

  try {
    const parsedBody = JSON.parse(event.body);
    ({ name, latitude, longitude } = parsedBody);
    
    if (!name || !latitude || !longitude) {
      throw new Error('Missing required parameters');
    }

    console.log('Parsed Request Body:', { name, latitude, longitude });

    const searchUrl = `https://api.content.tripadvisor.com/api/v1/location/search?key=${process.env.TRIPADVISOR_API_KEY}&searchQuery=${encodeURIComponent(name)}&latLong=${latitude},${longitude}&radius=5&radiusUnit=km&language=en`;
    
    console.log('Making TripAdvisor Search Request:', searchUrl.replace(process.env.TRIPADVISOR_API_KEY, 'MASKED'));

    const searchResponse = await fetch(searchUrl, { 
      headers: { 'Accept': 'application/json' }
    });
    console.log('TripAdvisor Search Response Status:', searchResponse.status);

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('TripAdvisor Search Error Response:', errorText);
      throw new Error(`TripAdvisor API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    console.log('TripAdvisor Search Response Data:', searchData);

    if (!searchData.data || searchData.data.length === 0) {
      console.log('No TripAdvisor results found for:', name);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: null })
      };
    }

    const location = searchData.data[0];
    const detailsUrl = `https://api.content.tripadvisor.com/api/v1/location/${location.location_id}/details?key=${process.env.TRIPADVISOR_API_KEY}&language=en&currency=USD`;
    
    console.log('Making TripAdvisor Details Request:', detailsUrl.replace(process.env.TRIPADVISOR_API_KEY, 'MASKED'));

    const detailsResponse = await fetch(detailsUrl, { 
      headers: { 'Accept': 'application/json' }
    });
    console.log('TripAdvisor Details Response Status:', detailsResponse.status);

    if (!detailsResponse.ok) {
      const errorText = await detailsResponse.text();
      console.error('TripAdvisor Details Error Response:', errorText);
      throw new Error(`TripAdvisor Details API error: ${detailsResponse.status}`);
    }

    const detailsData = await detailsResponse.json();
    console.log('TripAdvisor Details Response Data:', detailsData);

    const enrichedData = {
      ...location,
      details: detailsData
    };

    console.log('Found TripAdvisor data:', {
      name: enrichedData.name,
      rating: enrichedData.details.rating,
      numReviews: enrichedData.details.num_reviews
    });

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
