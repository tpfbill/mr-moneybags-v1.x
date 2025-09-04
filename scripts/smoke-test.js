'use strict';

require('dotenv').config();
const http = require('http');
const url = require('url');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;
let sessionCookie = null;

function httpRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(options.url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (sessionCookie && !reqOptions.headers.Cookie) {
      reqOptions.headers.Cookie = sessionCookie;
    }

    if (data) {
      reqOptions.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(reqOptions, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        let parsedData;
        try {
          parsedData = responseData ? JSON.parse(responseData) : {};
        } catch (e) {
          parsedData = responseData;
        }
        
        if (res.headers['set-cookie']) {
          sessionCookie = res.headers['set-cookie'][0].split(';')[0];
        }
        
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsedData
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function waitForServer(maxAttempts = 10, delay = 500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await httpRequest({ url: `${BASE_URL}/api/health` });
      if (response.statusCode === 200) {
        console.log(`Server is ready after ${attempt} attempt(s)`);
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  throw new Error(`Server failed to respond after ${maxAttempts} attempts`);
}

async function login() {
  console.log('Attempting login...');
  const response = await httpRequest({
    url: `${BASE_URL}/api/auth/login`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    username: 'admin',
    password: 'admin'
  });
  
  if (response.statusCode !== 200) {
    throw new Error(`Login failed with status ${response.statusCode}`);
  }
  
  console.log('Login successful');
  return response;
}

async function checkHealth() {
  console.log('Checking health endpoint...');
  const response = await httpRequest({ url: `${BASE_URL}/api/health` });
  
  if (response.statusCode !== 200) {
    throw new Error(`Health check failed with status ${response.statusCode}`);
  }
  
  console.log(`Health status: ${response.data.status}`);
  return response;
}

async function checkGLReport() {
  console.log('Querying GL report...');
  const response = await httpRequest({ 
    url: `${BASE_URL}/api/reports/gl?start_date=2025-01-01&end_date=2025-12-31` 
  });
  
  if (response.statusCode !== 200) {
    throw new Error(`GL report failed with status ${response.statusCode}`);
  }
  
  const { summary, detail } = response.data;
  console.log(`GL report summary rows: ${summary.length}, detail rows: ${detail.length}`);
  
  if (summary.length > 0 && summary[0].account_code) {
    console.log(`First account code: ${summary[0].account_code}`);
  }
  
  return response;
}

async function runTests() {
  try {
    // Start the server in a separate process
    const server = spawn('node', ['server-modular.js'], {
      stdio: 'ignore',
      detached: true
    });
    
    // Wait for server to be ready
    await waitForServer();
    
    // Run tests
    await login();
    await checkHealth();
    await checkGLReport();
    
    console.log('All tests passed successfully!');
    
    // Kill the server process and exit
    process.kill(server.pid);
    process.exit(0);
  } catch (error) {
    console.error(`Test failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the tests
runTests();

// Ensure the process exits even if something goes wrong
setTimeout(() => {
  console.error('Timeout reached, forcing exit');
  process.exit(2);
}, 30000);
