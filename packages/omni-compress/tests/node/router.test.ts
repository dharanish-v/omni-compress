import { describe, it, expect } from 'vitest';
import { Router } from '../../src/core/router';

describe('Router (Node Environment)', () => {
  it('should detect node environment', () => {
    expect(Router.getEnvironment()).toBe('node');
  });

  it('should evaluate isFastPath as false in Node', () => {
    const ctx = Router.evaluate({
      type: 'image',
      format: 'webp',
    });
    
    expect(ctx.env).toBe('node');
    expect(ctx.isFastPath).toBe(false); // Node never uses browser fast paths
  });
});
