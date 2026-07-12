//@ts-check
const { join } = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Root monorepo tường minh — không để Next đoán nhầm theo lockfile lạc ngoài repo
  turbopack: {
    root: join(__dirname, '../..'),
  },
};

module.exports = nextConfig;
