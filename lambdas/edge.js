async function handler (event) {
  const { request } = event.Records[0].cf;
  const headers = request.headers;

  const username = 'kromid';
  const password = 'kromid';

  const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64');
  const authString = `Basic ${base64Credentials}`;

  console.log('authString', authString)
  console.log('headers.authorization', headers.authorization)

  // If authorization header isn't present or doesn't match expected authString, deny the request
  if (
    typeof headers.authorization == 'undefined' || headers.authorization[0].value !== authString
  ) {
    return {
      body: `${authString} || ${headers.authorization}`,
      headers: {
        'www-authenticate': [{ key: 'WWW-Authenticate', value: 'Basic' }]
      },
      status: '401',
      statusDescription: 'Unauthorized',
    };
  }

  delete headers.authorization;

  // Continue request processing
  return request;
}

module.exports.handler = handler;
