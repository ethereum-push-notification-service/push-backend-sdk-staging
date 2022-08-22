export interface ISendNotificationInputOptions {
  signer: any;
  chainId: number;
  type: number;
  identityType: number;
  notification: {
    title: string;
    body: string;
  };
  payload: {
    sectype?: string;
    title: string;
    body: string;
    cta: string;
    img: string;
  },
  recipients?: string | [string];
  channel: string;
  expiry?: number;
  hidden?: boolean;
  graph?: {
    id: string,
    counter: number
  };
  ipfsHash?: string;
  dev?: boolean;
}

export interface INotificationPayload {
  notification: {
    title: string;
    body: string;
  };
  data: {
    acta: string;
    aimg: string;
    amsg: string;
    asub: string;
    type: string;
    etime?: number;
    hidden?: boolean;
    sectype?: string;
  };
  // recipients: any;
};