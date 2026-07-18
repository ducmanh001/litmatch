import { readIsolatedNodeServerState } from '../../../../libs/e2e-support/src';
import axios from 'axios';

module.exports = async function () {
  const state = readIsolatedNodeServerState('signaling-gateway');
  axios.defaults.baseURL = `http://${state.host}:${state.port}`;
};
