import { Response } from 'express';

export const response = (res: Response, code: number, message: string, data?: object) => {
  res.status(code).json({ message, ...data });
};
