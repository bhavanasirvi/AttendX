/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({ details: { ssid: 'mock-wifi' } })),
    addEventListener: jest.fn(),
  },
}));

jest.mock('react-native-geolocation-service', () => ({
  __esModule: true,
  default: {
    getCurrentPosition: jest.fn(),
  },
}));

jest.mock('react-native-vision-camera', () => ({
  __esModule: true,
  Camera: function MockCamera() {
    return null;
  },
  useCameraDevice: jest.fn(() => null),
}));

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
