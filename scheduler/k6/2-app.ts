// @ts-nocheck

import * as k6Utils from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { check, sleep } from 'k6';
import http from 'k6/http';

export const options = {
  vus: 300, // 80 is the right number
  duration: '10m',

  // stages: [
  //   { duration: '1m', target: 100 }, // Ramp up to 20 VUs
  //   { duration: '1m', target: 200 }, // Increase to 50 VUs
  //   { duration: '3m', target: 300 }, // Peak load
  //   { duration: '3m', target: 400 }, // Ramp down
  //   { duration: '3m', target: 500 }, // Ramp down
  //   { duration: '5m', target: 500 }, // Ramp down
  //   { duration: '5m', target: 600 }, // Ramp down
  //   { duration: '5m', target: 700 }, // Ramp down
  //   { duration: '5m', target: 800 }, // Ramp down
  //   { duration: '5m', target: 800 }, // Ramp down
  //   // { duration: '3m', target: 300 }, // Ramp down
  //   // { duration: '2m', target: 200 }, // Ramp down
  //   { duration: '2m', target: 0 }, // Ramp down
  // ],

  // A number specifying the number of VUs to run concurrently.
  // vus: 40,
  // // A string specifying the total duration of the test run.
  // duration: '20m',

  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)', 'p(99.99)', 'count'],
};

// Use environment variable, fallback to localhost
const BASE_URLS = ['https://app2.edd2devops.net'];

const randomItem = k6Utils.randomItem;

export default function () {
  const target = randomItem(BASE_URLS);
  check(http.get(`${target}`), { 'status 200': (r) => r.status === 200 });
  sleep(0.1);
}
