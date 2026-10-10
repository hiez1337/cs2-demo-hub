import { z } from 'zod';

export const ConfigSchema = z.object({
  steamId: z
    .string()
    .regex(/^\d{17}$/, 'Steam ID должен содержать ровно 17 цифр (SteamID64)')
    .default('76561198434644264'),

  faceitApiKey: z
    .string()
    .default(''),

  maxPages: z
    .coerce
    .number()
    .int('Количество страниц должно быть целым числом')
    .min(1, 'Минимум 1 страница')
    .max(100, 'Максимум 100 страниц')
    .default(3),

  chunkConcurrency: z
    .coerce
    .number()
    .int()
    .min(1, 'Минимум 1 поток')
    .max(16, 'Максимум 16 потоков')
    .default(4),

  chunkSizeBytes: z
    .coerce
    .number()
    .int()
    .min(1024 * 1024, 'Минимум 1MB')
    .default(10 * 1024 * 1024), // 10MB default

  webPort: z
    .coerce
    .number()
    .int()
    .min(1024, 'Порт должен быть > 1024')
    .max(65535, 'Порт должен быть <= 65535')
    .default(3333),

  webHost: z
    .string()
    .default('127.0.0.1'),

  watchIntervalMinutes: z
    .coerce
    .number()
    .min(1, 'Интервал не может быть меньше 1 минуты')
    .max(1440, 'Интервал не может быть больше 24 часов')
    .default(10),

  apiSecretToken: z
    .string()
    .optional(),

  headless: z
    .boolean()
    .default(false),

  tempDownloadsDir: z
    .string()
    .default('./demos_temp'),

  browserSessionDir: z
    .string()
    .default('./.browser_session'),

  cookiesFile: z
    .string()
    .default('./cookies.json'),

  historyFile: z
    .string()
    .default('./uploaded_history.json'),
});
