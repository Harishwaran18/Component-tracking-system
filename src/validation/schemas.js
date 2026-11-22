'use strict';

const { z } = require('zod');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const username = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(40, 'Username is too long')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dot, underscore or dash');

const email = z.string().trim().email('Invalid email address').max(160);

const role = z.enum(['admin', 'staff', 'student']);

const optionalString = (max = 500) => z.string().trim().max(max).optional().nullable();

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({ refreshToken: z.string().min(10) });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

const createUserSchema = z.object({
  username,
  email,
  fullName: z.string().trim().min(2).max(120),
  password,
  role: role.default('student'),
});

const updateUserSchema = z
  .object({
    email: email.optional(),
    fullName: z.string().trim().min(2).max(120).optional(),
    role: role.optional(),
    isActive: z.boolean().optional(),
    password: password.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const createStudentSchema = z.object({
  regNo: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(120),
  email: email.optional().nullable(),
  phone: optionalString(30),
  dept: z.string().trim().min(1).max(60).default('ECE'),
  year: z.number().int().min(1).max(6).optional().nullable(),
  notes: optionalString(1000),
});

const updateStudentSchema = createStudentSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'At least one field is required',
});

const createComponentSchema = z.object({
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(1).max(80).default('General'),
  description: optionalString(2000),
  location: optionalString(120),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  totalQuantity: z.number().int().min(0).max(1_000_000),
  availableQuantity: z.number().int().min(0).max(1_000_000).optional(),
  minStock: z.number().int().min(0).max(1_000_000).default(0),
  unitCost: z.number().min(0).max(100_000_000).default(0),
  condition: z.enum(['good', 'fair', 'damaged']).default('good'),
});

const updateComponentSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    description: optionalString(2000),
    location: optionalString(120),
    unit: z.string().trim().min(1).max(20).optional(),
    totalQuantity: z.number().int().min(0).max(1_000_000).optional(),
    minStock: z.number().int().min(0).max(1_000_000).optional(),
    unitCost: z.number().min(0).max(100_000_000).optional(),
    condition: z.enum(['good', 'fair', 'damaged']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const restockSchema = z.object({
  quantity: z.number().int().min(1).max(1_000_000),
  unitCost: z.number().min(0).max(100_000_000).optional(),
  notes: optionalString(500),
});

const issueSchema = z.object({
  studentId: z.string().uuid('A valid studentId is required'),
  componentId: z.string().uuid('A valid componentId is required'),
  quantity: z.number().int().min(1).max(10_000),
  dueAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  notes: optionalString(1000),
});

const returnSchema = z.object({
  quantity: z.number().int().min(1).max(10_000),
  condition: z.enum(['good', 'fair', 'damaged']).default('good'),
  notes: optionalString(1000),
});

const lostSchema = z.object({
  quantity: z.number().int().min(1).max(10_000),
  notes: optionalString(1000),
});

module.exports = {
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  createUserSchema,
  updateUserSchema,
  createStudentSchema,
  updateStudentSchema,
  createComponentSchema,
  updateComponentSchema,
  restockSchema,
  issueSchema,
  returnSchema,
  lostSchema,
};
