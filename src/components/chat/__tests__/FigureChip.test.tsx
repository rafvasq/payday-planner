import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FigureChip } from '../FigureChip';

describe('FigureChip: 4 Classification Classes', () => {
  it('renders engine-verified class with teal styling and dotted underline', () => {
    render(
      <FigureChip
        rawText="-$1,211.92"
        figure="-$1,211.92"
        classification="engine"
        sourceLabel="R Chequing · lowest projected balance Oct 21"
      />
    );

    const chip = screen.getByText('-$1,211.92');
    expect(chip).toBeInTheDocument();
    expect(chip.className).toMatch(/teal/);
    expect(chip.className).toMatch(/dotted/);
  });

  it('opens popover on click for engine figure revealing source label', async () => {
    render(
      <FigureChip
        rawText="$4,357.22"
        figure="$4,357.22"
        classification="engine"
        sourceLabel="Main Chequing starting balance"
      />
    );

    const trigger = screen.getByText('$4,357.22');
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText(/Engine figure:/i)).toBeInTheDocument();
      expect(screen.getByText(/Main Chequing starting balance/i)).toBeInTheDocument();
    });
  });

  it('renders derived class with checkmark cue and teal styling', () => {
    render(
      <FigureChip
        rawText="$5,686.54"
        figure="$5,686.54"
        classification="derived"
        formula="$2,486.54 + $3,200.00 = $5,686.54"
      />
    );

    expect(screen.getByText('$5,686.54')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('opens popover on click for derived figure revealing arithmetic formula', async () => {
    render(
      <FigureChip
        rawText="$5,686.54"
        figure="$5,686.54"
        classification="derived"
        formula="$2,486.54 + $3,200.00 = $5,686.54"
      />
    );

    const trigger = screen.getByText('$5,686.54');
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText(/Derived:/i)).toBeInTheDocument();
      expect(screen.getByText(/\$2,486\.54 \+ \$3,200\.00 = \$5,686\.54/i)).toBeInTheDocument();
    });
  });

  it('renders user_stated class with neutral styling without checkmark or warning icon', () => {
    render(
      <FigureChip
        rawText="$450.00"
        figure="$450.00"
        classification="user_stated"
      />
    );

    const chip = screen.getByText('$450.00');
    expect(chip).toBeInTheDocument();
    expect(chip.className).not.toMatch(/amber/);
    expect(screen.queryByText('✓')).toBeNull();
    expect(screen.queryByText('⚠')).toBeNull();
  });

  it('opens popover on click for user_stated figure stating origin in conversation', async () => {
    render(
      <FigureChip
        rawText="$450.00"
        figure="$450.00"
        classification="user_stated"
      />
    );

    const trigger = screen.getByText('$450.00');
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText(/Stated in conversation/i)).toBeInTheDocument();
    });
  });

  it('renders unverified class with amber warning styling and alert triangle icon', () => {
    render(
      <FigureChip
        rawText="$2,825.00"
        figure="$2,825.00"
        classification="unverified"
      />
    );

    const chip = screen.getByText('$2,825.00');
    expect(chip).toBeInTheDocument();
    expect(chip.className).toMatch(/amber/);
    expect(screen.getByText('⚠')).toBeInTheDocument();
  });

  it('opens popover on click for unverified figure showing caution warning', async () => {
    render(
      <FigureChip
        rawText="$2,825.00"
        figure="$2,825.00"
        classification="unverified"
      />
    );

    const trigger = screen.getByText('$2,825.00');
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(
        screen.getByText(/Not produced by (the )?engine — treat with caution/i)
      ).toBeInTheDocument();
    });
  });
});

describe('FigureChip: Accessibility & Keyboard Navigation', () => {
  it('is keyboard focusable with tabIndex=0', () => {
    render(
      <FigureChip
        rawText="$3,300.00"
        figure="$3,300.00"
        classification="engine"
        sourceLabel="Simulated deposit"
      />
    );

    const chip = screen.getByText('$3,300.00');
    expect(chip).toHaveAttribute('tabIndex', '0');
  });

  it('opens popover when triggered via keyboard', async () => {
    render(
      <FigureChip
        rawText="$3,300.00"
        figure="$3,300.00"
        classification="engine"
        sourceLabel="Simulated deposit"
      />
    );

    const chip = screen.getByText('$3,300.00');
    chip.focus();
    expect(document.activeElement).toBe(chip);

    fireEvent.keyDown(chip, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText(/Simulated deposit/i)).toBeInTheDocument();
    });
  });

  it('supports passing classification data via object prop', () => {
    render(
      <FigureChip
        classificationData={{
          rawText: '-$113.73',
          cents: -11373,
          classification: 'engine',
          sourceLabel: 'Oct 21 buffer',
        }}
      />
    );

    expect(screen.getByText('-$113.73')).toBeInTheDocument();
  });
});
