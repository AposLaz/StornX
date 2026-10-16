import axios from 'axios';

import { logger } from '../../config/logger.js';

import type { PrometheusResponseType } from './types.js';

export const executePrometheusQuery = async (
  prometheusUrl: string,
  query: string,
): Promise<PrometheusResponseType | undefined> => {
  try {
    const result = await axios.get<PrometheusResponseType>(`${prometheusUrl}/api/v1/query`, {
      params: { query },
      timeout: 10000,
      maxContentLength: 8 * 1024 * 1024,
      maxRedirects: 0,
    });

    if (result.data.status !== 'success') {
      throw new Error('Prometheus query did not succeed');
    }

    const oldest = Date.now() / 1000 - Number(process.env.MAX_METRIC_AGE_SECONDS ?? 600);

    if (
      result.data.data.result.some(
        (sample) =>
          !Number.isFinite(Number(sample.value?.[0])) ||
          Number(sample.value[0]) < oldest ||
          !Number.isFinite(Number(sample.value[1])),
      )
    ) {
      throw new Error('Stale or invalid Prometheus response');
    }

    return result.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(`Error executing Prometheus query: ${query}`, {
        message: error.message,
        responseData: error.response?.data,
        responseStatus: error.response?.status,
      });
    } else {
      logger.error(`Unexpected error executing Prometheus query: ${query}`, error);
    }

    throw error;
  }
};
