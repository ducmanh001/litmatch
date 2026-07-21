import { readIsolatedNodeServerState } from './isolated-node-server';
import axios from 'axios';

module.exports = async function () {
  const state = readIsolatedNodeServerState('signaling-gateway');
  axios.defaults.baseURL = `http://${state.host}:${state.port}`;
};
