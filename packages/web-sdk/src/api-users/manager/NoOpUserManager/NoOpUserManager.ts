import type { UserManager } from '../types.ts';

export class NoOpUserManager implements UserManager {
  public getEmbraceUserId(): string {
    return '';
  }

  public getUserId(): string | null {
    return null;
  }

  public setUserId(): void {}

  public clearUserId(): void {}
}
