import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Canyon Tour app', () => {
  render(<App />);
  const titleElement = screen.getByText(/Canyon Tour/i);
  expect(titleElement).toBeInTheDocument();
});
