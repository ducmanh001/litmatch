// jest-environment-node không expose TextEncoder/TextDecoder (jose cần) — vá từ node:util
import { TextDecoder, TextEncoder } from 'node:util';

Object.assign(globalThis, { TextEncoder, TextDecoder });
