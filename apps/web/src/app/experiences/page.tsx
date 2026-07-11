import { Metadata } from 'next';
import ExperiencesBookingClient from './ExperiencesBookingClient';

export const metadata: Metadata = {
  title: 'Experiences | Owambe',
  description: 'Discover and book curated experiences — cooking classes, cultural tours, art workshops and more.',
};

export default function ExperiencesPage() {
  return <ExperiencesBookingClient />;
}
