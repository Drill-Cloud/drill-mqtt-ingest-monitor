import type { AppConfig } from './config.js';

export class MatrixNotifier {
  constructor(private readonly config: AppConfig) {}

  async send(message: string): Promise<void> {
    if (!this.config.matrixEnabled) {
      return;
    }

    if (!this.config.matrixRoomId || !this.config.matrixAccessToken) {
      console.warn('matrix.skip_missing_config');
      return;
    }

    const txnId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const roomId = encodeURIComponent(this.config.matrixRoomId);
    const url = `${this.config.matrixHomeserver}/_matrix/client/v3/rooms/${roomId}/send/m.room.message/${txnId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${this.config.matrixAccessToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        msgtype: 'm.text',
        body: message,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `${response.status} ${response.statusText}`);
    }
  }
}
