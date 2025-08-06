/**
 * test-db-connection.js
 * 
 * A simple script to test the database connection by making a direct API request
 * to the backend server running on port 3000.
 */

const http = require('http');

console.log('Testing database connection via API...');
console.log('Endpoint: http://localhost:3000/api/entities');

// Make a GET request to the API
const req = http.get('http://localhost:3000/api/entities', (res) => {
  const { statusCode } = res;
  const contentType = res.headers['content-type'];

  console.log(`Status Code: ${statusCode}`);
  console.log(`Content Type: ${contentType}`);

  let error;
  // Check if the request was successful
  if (statusCode !== 200) {
    error = new Error(`Request Failed.\nStatus Code: ${statusCode}`);
  } else if (!/^application\/json/.test(contentType)) {
    error = new Error(`Invalid content-type.\nExpected application/json but received ${contentType}`);
  }

  if (error) {
    console.error(error.message);
    // Consume response data to free up memory
    res.resume();
    return;
  }

  res.setEncoding('utf8');
  let rawData = '';
  
  // Collect data chunks
  res.on('data', (chunk) => { rawData += chunk; });
  
  // Process the complete response
  res.on('end', () => {
    try {
      const parsedData = JSON.parse(rawData);
      console.log('Connection successful!');
      console.log(`Received ${parsedData.length} entities from the database.`);
      
      // Display the first entity as a sample
      if (parsedData.length > 0) {
        console.log('\nSample entity:');
        console.log(JSON.stringify(parsedData[0], null, 2));
      }
      
      console.log('\nDatabase connection is working properly.');
    } catch (e) {
      console.error(`Error parsing JSON response: ${e.message}`);
    }
  });
});

// Handle request errors
req.on('error', (e) => {
  console.error(`API Request Error: ${e.message}`);
  console.log('\nPossible causes:');
  console.log('1. The backend server is not running on port 3000');
  console.log('2. There is a network issue preventing the connection');
  console.log('3. The database might be offline or inaccessible');
});

// Set a timeout for the request
req.setTimeout(5000, () => {
  req.abort();
  console.error('Request timed out after 5 seconds');
});
