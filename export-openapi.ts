import swaggerJsDoc from 'swagger-jsdoc';
import fs from 'fs';

const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'CreditOS (Lendr) API',
      version: '1.0.0',
      description: 'API documentation for the CreditOS Embedded Credit Platform',
      contact: {
        name: 'CreditOS Support',
      },
    },
    servers: [
      {
        url: 'http://localhost:8000',
        description: 'Development Gateway',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Lendr-Secret-Key',
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
  },
  apis: ['./src/index.ts'], // Point to the gateway for doc annotations
};

const swaggerSpec = swaggerJsDoc(swaggerOptions);
fs.writeFileSync('openapi.json', JSON.stringify(swaggerSpec, null, 2));
console.log('OpenAPI spec written to openapi.json');
