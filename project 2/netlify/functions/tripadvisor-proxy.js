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
  console.log('Function environment:', {
    nodeEnv: process.env.NODE_ENV,
    hasTripadvisorKey: !!process.env.TRIPADVISOR_API_KEY,
    functionName: context.functionName,
    functionVersion: context.functionVersion
  });

  console.log('Request details:', {
    method: event.httpMethod,
    path: event.path,
    headers: event.headers,
    body: event.body ? JSON.parse(event.body) : null
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
    return {
      statusCode: 204,
      headers,
      body: ''
    };
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

      try {
        const detailsResponse = await fetch(detailsUrl, {
          headers: { 'Accept': 'application/json' }
        });

        const responseText = await detailsResponse.text();
        console.log('Raw details response:', responseText);

        if (!detailsResponse.ok) {
          throw new Error(`TripAdvisor Details API error: ${detailsResponse.status} - ${responseText}`);
        }

        const detailsData = JSON.parse(responseText);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ data: detailsData })
        };
      } catch (error) {
        console.error('Details request failed:', error);
        throw error;
      }
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

    try {
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Accept': 'application/json' }
      });

      const searchResponseText = await searchResponse.text();
      console.log('Raw search response:', searchResponseText);

      if (!searchResponse.ok) {
        throw new Error(`TripAdvisor Search API error: ${searchResponse.status} - ${searchResponseText}`);
      }

      const searchData = JSON.parse(searchResponseText);
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
        throw new Error(`TripAdvisor Details API error: ${detailsResponse.status} - ${detailsResponseText}`);
      }

      const detailsData = JSON.parse(detailsResponseText);
      const enrichedData = {
        ...location,
        details: detailsData
      };

      console.log('Final enriched data for:', name);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: enrichedData })
      };
    } catch (error) {
      console.error('Search request failed:', error);
      throw error;
    }
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
