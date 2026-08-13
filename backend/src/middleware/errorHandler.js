import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';

export function errorHandler(error, req, res, next) {
  const requestId = req.id;
  const log = req.log ?? console;

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.issues, requestId }
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: { code: error.code, message: error.message, details: error.details, requestId }
    });
  }

  if (error?.name === 'CastError') {
    return res.status(400).json({
      error: { code: 'INVALID_IDENTIFIER', message: 'One or more identifiers are invalid', requestId }
    });
  }

  if (error?.code === 11000) {
    return res.status(409).json({
      error: { code: 'DUPLICATE_RESOURCE', message: 'A resource with those values already exists', requestId }
    });
  }

  log.error({ err: error, requestId }, 'Unhandled request error');
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId }
  });
}
