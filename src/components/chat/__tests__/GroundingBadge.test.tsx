import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GroundingBadge } from '../GroundingBadge';

describe('GroundingBadge: Footer Badge States', () => {
  it('renders all engine-verified badge with checkmark when unverifiedCount is 0', () => {
    render(<GroundingBadge totalFigures={4} unverifiedCount={0} />);

    expect(screen.getByText(/4 figures · all engine-verified/i)).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.queryByText(/unverified/i)).not.toBeInTheDocument();
  });

  it('renders singular "1 figure · all engine-verified" when totalFigures is 1', () => {
    render(<GroundingBadge totalFigures={1} unverifiedCount={0} />);

    expect(screen.getByText(/1 figure · all engine-verified/i)).toBeInTheDocument();
  });

  it('renders amber warning badge with alert triangle when there are unverified figures', () => {
    render(<GroundingBadge totalFigures={3} unverifiedCount={2} />);

    expect(screen.getByText(/2 unverified figures/i)).toBeInTheDocument();
    expect(screen.getByText('⚠')).toBeInTheDocument();
  });

  it('renders singular "1 unverified figure" when unverifiedCount is 1', () => {
    render(<GroundingBadge totalFigures={4} unverifiedCount={1} />);

    expect(screen.getByText(/1 unverified figure$/i)).toBeInTheDocument();
    expect(screen.getByText('⚠')).toBeInTheDocument();
  });

  it('renders nothing when totalFigures is 0', () => {
    const { container } = render(<GroundingBadge totalFigures={0} unverifiedCount={0} />);

    expect(container.firstChild).toBeNull();
  });

  it('supports passing classification summary via object prop', () => {
    render(
      <GroundingBadge
        summary={{
          totalFigures: 5,
          unverifiedCount: 0,
        }}
      />
    );

    expect(screen.getByText(/5 figures · all engine-verified/i)).toBeInTheDocument();
  });
});
