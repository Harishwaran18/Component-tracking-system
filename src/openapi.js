'use strict';

const config = require('./config');

const bearer = [{ bearerAuth: [] }];

const errorSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object' } },
      },
    },
  },
};

const pagination = {
  page: { type: 'integer', minimum: 1, default: 1 },
  pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'ECE Component Tracking System API',
    version: config.version,
    description:
      'Production-ready REST API for ECE laboratory component inventory, student issue/return workflows, QR tracking and audit logging.',
  },
  servers: [{ url: '/', description: 'Current host' }],
  tags: [
    { name: 'Auth' },
    { name: 'Users' },
    { name: 'Students' },
    { name: 'Components' },
    { name: 'Transactions' },
    { name: 'Dashboard' },
    { name: 'Audit' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: { Error: errorSchema },
  },
  paths: {
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Authenticate and obtain tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'admin' },
                  password: { type: 'string', example: 'Admin@12345' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Access and refresh tokens' }, 401: { description: 'Invalid credentials' } },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate a refresh token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } },
            },
          },
        },
        responses: { 200: { description: 'New token pair' }, 401: { description: 'Invalid refresh token' } },
      },
    },
    '/api/auth/logout': { post: { tags: ['Auth'], summary: 'Revoke a refresh token', responses: { 204: { description: 'Revoked' } } } },
    '/api/auth/me': {
      get: { tags: ['Auth'], security: bearer, summary: 'Current user', responses: { 200: { description: 'User profile' } } },
    },
    '/api/auth/change-password': {
      post: { tags: ['Auth'], security: bearer, summary: 'Change own password', responses: { 200: { description: 'Updated' } } },
    },
    '/api/users': {
      get: { tags: ['Users'], security: bearer, summary: 'List users (admin)', responses: { 200: { description: 'Paginated users' } } },
      post: { tags: ['Users'], security: bearer, summary: 'Create user (admin)', responses: { 201: { description: 'Created' } } },
    },
    '/api/students': {
      get: { tags: ['Students'], security: bearer, summary: 'List students', responses: { 200: { description: 'Paginated students' } } },
      post: { tags: ['Students'], security: bearer, summary: 'Create student', responses: { 201: { description: 'Created' } } },
    },
    '/api/students/{id}': {
      get: { tags: ['Students'], security: bearer, summary: 'Get student with stats', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Student' } } },
      patch: { tags: ['Students'], security: bearer, summary: 'Update student', responses: { 200: { description: 'Updated' } } },
      delete: { tags: ['Students'], security: bearer, summary: 'Deactivate student', responses: { 204: { description: 'Deactivated' } } },
    },
    '/api/components': {
      get: {
        tags: ['Components'],
        security: bearer,
        summary: 'List components',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'lowStock', in: 'query', schema: { type: 'boolean' } },
          { name: 'sort', in: 'query', schema: { type: 'string' } },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          { name: 'page', in: 'query', schema: pagination.page },
          { name: 'pageSize', in: 'query', schema: pagination.pageSize },
        ],
        responses: { 200: { description: 'Paginated components' } },
      },
      post: { tags: ['Components'], security: bearer, summary: 'Create component', responses: { 201: { description: 'Created' } } },
    },
    '/api/components/{id}': {
      get: { tags: ['Components'], security: bearer, summary: 'Get component', responses: { 200: { description: 'Component' } } },
      patch: { tags: ['Components'], security: bearer, summary: 'Update component', responses: { 200: { description: 'Updated' } } },
      delete: { tags: ['Components'], security: bearer, summary: 'Deactivate component', responses: { 204: { description: 'Deactivated' } } },
    },
    '/api/components/{id}/restock': {
      post: { tags: ['Components'], security: bearer, summary: 'Restock component', responses: { 200: { description: 'Restocked' } } },
    },
    '/api/components/{id}/qr': {
      get: { tags: ['Components'], security: bearer, summary: 'Get QR data URL', responses: { 200: { description: 'QR image data URL' } } },
    },
    '/api/components/by-qr/{code}': {
      get: { tags: ['Components'], security: bearer, summary: 'Lookup component by QR code', responses: { 200: { description: 'Component' }, 404: { description: 'Not found' } } },
    },
    '/api/transactions': {
      get: {
        tags: ['Transactions'],
        security: bearer,
        summary: 'List transactions',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['issued', 'partially_returned', 'returned', 'lost'] } },
          { name: 'overdue', in: 'query', schema: { type: 'boolean' } },
          { name: 'studentId', in: 'query', schema: { type: 'string' } },
          { name: 'componentId', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: pagination.page },
          { name: 'pageSize', in: 'query', schema: pagination.pageSize },
        ],
        responses: { 200: { description: 'Paginated transactions' } },
      },
    },
    '/api/transactions/issue': {
      post: { tags: ['Transactions'], security: bearer, summary: 'Issue a component to a student', responses: { 201: { description: 'Issued' }, 409: { description: 'Insufficient stock' } } },
    },
    '/api/transactions/{id}/return': {
      post: { tags: ['Transactions'], security: bearer, summary: 'Return units', responses: { 200: { description: 'Returned' } } },
    },
    '/api/transactions/{id}/lost': {
      post: { tags: ['Transactions'], security: bearer, summary: 'Mark units lost', responses: { 200: { description: 'Updated' } } },
    },
    '/api/dashboard/summary': {
      get: { tags: ['Dashboard'], security: bearer, summary: 'KPI summary', responses: { 200: { description: 'Summary' } } },
    },
    '/api/dashboard/activity': {
      get: { tags: ['Dashboard'], security: bearer, summary: 'Daily issue/return series', responses: { 200: { description: 'Series' } } },
    },
    '/api/audit': {
      get: { tags: ['Audit'], security: bearer, summary: 'Audit log (admin)', responses: { 200: { description: 'Paginated audit entries' } } },
    },
    '/health': { get: { tags: ['Auth'], summary: 'Liveness probe', responses: { 200: { description: 'Healthy' } } } },
    '/health/ready': { get: { tags: ['Auth'], summary: 'Readiness probe', responses: { 200: { description: 'Ready' }, 503: { description: 'Not ready' } } } },
  },
};
