/**
 * ComposerFB — slash command popup dismissal (2026-05-30).
 *
 * Bug: the SLASH COMMANDS popup (/run /approve /retry …) stayed open when the
 * user clicked a blank area outside it. Fix: close on mousedown outside the
 * popup and the "/命令" toggle button.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ComposerFB from './ComposerFB';

function open() {
  render(<ComposerFB value="" onChange={() => {}} onSend={() => {}} />);
  // '/' on an empty input opens the slash menu (handleKeyDown).
  fireEvent.keyDown(screen.getByRole('textbox'), { key: '/' });
  expect(screen.getByText('SLASH COMMANDS')).toBeInTheDocument();
}

describe('ComposerFB slash menu', () => {
  it('closes on outside (blank area) click', () => {
    open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('SLASH COMMANDS')).toBeNull();
  });

  it('stays open when clicking inside the popup', () => {
    open();
    fireEvent.mouseDown(screen.getByText('SLASH COMMANDS'));
    expect(screen.getByText('SLASH COMMANDS')).toBeInTheDocument();
  });
});
