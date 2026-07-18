import { readIsolatedNodeServerState } from '@litmatch/e2e-support';
import axios from 'axios';

module.exports = async function () {
  const state = readIsolatedNodeServerState('core-api');
  axios.defaults.baseURL = `http://${state.host}:${state.port}`;
};
