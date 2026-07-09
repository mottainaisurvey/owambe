import { Metadata } from 'next';
import StaysBookingClient from './StaysBookingClient';

export const metadata: Metadata = {
  title: 'Stays | Owambe',
  description: 'Find, book, and manage accommodation for Owambe celebrations.',
};

export default function StaysPage() {
  return <StaysBookingClient />;
}
