import { readIsolatedNodeServerState } from './isolated-node-server';
import axios from 'axios';

module.exports = async function () {
  const state = readIsolatedNodeServerState('core-api');
  axios.defaults.baseURL = `http://${state.host}:${state.port}`;
};
