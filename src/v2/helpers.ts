import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import CONFIG, { 
  ETH_MAINNET, 
  POLYGON_MAINNET, 
  PROD, STAGING,
  DEV,
  ConfigType
} from './config';
import { ISendNotificationInputOptions, INotificationPayload } from './types';
import {
  STORAGE_TYPE,
  STORAGE_TYPE_TO_VERIFICATION_TYPE_MAP,
  NOTIFICATION_TYPE,
  CHAIN_ID_TO_SOURCE,
  SOURCE_TYPES
} from './constants';

export function getUUID() {
  return uuidv4();
}

export const getEpnsConfig = (chainId: number, isDev?: boolean) : ConfigType => {
  // for Mainnet
  if ([ETH_MAINNET, POLYGON_MAINNET].includes(chainId)) {
    return CONFIG[chainId][PROD];
  }

  // if explicitly passed "dev: true"
  if (isDev) {
    return CONFIG[chainId][DEV];
  }

  // by default
  return CONFIG[chainId][STAGING];
};


/**
 * This function will map the Input options passed to the SDK to the "payload" structure
 * needed by the API input
 */
export function getPayloadForAPIInput(
  inputOptions: ISendNotificationInputOptions,
  recipients: any
) : INotificationPayload{
  return {
    notification: {
      title: inputOptions?.notification?.title,
      body: inputOptions?.notification?.body
    },
    data: {
      acta: inputOptions?.payload?.cta || '',
      aimg: inputOptions?.payload?.img || '',
      amsg: inputOptions?.payload?.body || '',
      asub: inputOptions?.payload?.title || '',
      type: inputOptions?.type?.toString() || '',
      ...(inputOptions?.expiry && { etime: inputOptions?.expiry }),
      ...(inputOptions?.hidden && { hidden: inputOptions?.hidden }),
      ...(inputOptions?.payload?.sectype && { sectype: inputOptions?.payload?.sectype })
    },
    recipients: recipients
  };
}

export function getVerificationType(storage: number, chainId: number) {
  if (storage === STORAGE_TYPE.SMART_CONTRACT) {
    const verifcationMap = STORAGE_TYPE_TO_VERIFICATION_TYPE_MAP[storage];
    return verifcationMap[chainId];
  }

  return STORAGE_TYPE_TO_VERIFICATION_TYPE_MAP[storage];
}

export async function getEIP712Signature(
    signer: any,
    chainId: number,
    verifyingContract: string,
    payload: any,
) {
    const DOMAIN = {
        name: 'EPNS COMM V1',
        chainId: chainId,
        verifyingContract,
    };

    /**
     * We WILL have CHANGE here because of RECIPIENT changes from BE
     */

    const TYPE = {
      Payload: [
        { name: 'notification', type: 'Notification' },
        { name: 'data', type: 'Data' },
        // TODO - add Recipients once BE confirms
      ],
      Notification: [
        { name: 'title', type: 'string' },
        { name: 'body', type: 'string' },
      ],
      Data: [
        { name: 'acta', type: 'string' },
        { name: 'aimg', type: 'string' },
        { name: 'amsg', type: 'string' },
        { name: 'asub', type: 'string' },
        { name: 'type', type: 'string' }
      ]
      // TODO - add Recipients once BE confirms
    };

    if (payload?.data?.etime) {
      TYPE.Data.push({ name: 'etime', type: 'number' })
    }

    if (payload?.data?.hidden) {
      TYPE.Data.push({ name: 'hidden', type: 'boolean' })
    }

    const signature = await signer._signTypedData(DOMAIN, TYPE, payload);

    return signature;
};

/**
 * This function gets the hashed identity bytes from the notification type & payload.
 */
export function getPayloadIdentity_old(storage: number, payload: INotificationPayload) {
  // step 1: hash the whole payload
  const payloadHash = CryptoJS.SHA256(JSON.stringify(payload)).toString(CryptoJS.enc.Hex);

  // step 2: create the string in the format of `2+${<PAYLOAD_HASH>}`
  const identityString = `${storage}+${JSON.stringify(payload)}`;
  
  return identityString;
}

/**
 * This function returns the recipient format accepted by the API for different notification types
 */
export async function getRecipients(
  notificationType: number,
  recipients?: string | [string],
  secretType?: string,
  channel?: string
) {
  if (secretType) {
    return '';
    /**
     * Currently SECRET FLOW is yet to be finalized on the backend, so will revisit this later.
     * But in secret flow we basically generate secret for the address
     * and send it in { 0xtarget: secret_generated_for_0xtarget } format for all
     */
  } else {
  /**
   * NON-SECRET FLOW
   */
    if (notificationType === NOTIFICATION_TYPE.BROADCAST) {
      if (!recipients) {
        return channel;
      }
      return recipients;
    } else if (notificationType === NOTIFICATION_TYPE.TARGETTED) {
      if (typeof recipients === 'string') {
        return {
          [recipients]: null
        };
      }
    } else if (notificationType === NOTIFICATION_TYPE.SUBSET) {
      if (Array.isArray(recipients)) {
        const recipientObject =  recipients.reduce((_recipients, _rAddress) => ({
          ..._recipients,
          [_rAddress]: null
        }), {});

        return recipientObject;
      }
    }
  }
  return recipients;
}


export async function getVerificationProof(vProofArgs: {
  signer: any,
  chainId: number,
  storage: number,
  verifyingContract: string,
  payload: any,
  ipfsHash?: string, // need to pass this
  txHash?: string, // need to pass this
  subgraphId?: string, // need to pass this
  subgraphNotificationCounter?: number // need to pass this
}) {

  const {
    signer,
    chainId,
    storage,
    verifyingContract,
    payload,
    ipfsHash, // where do we get this, directly from the consumer??
    txHash, // where do we get this, directly from the consumer??
    subgraphId, // where do we get this, directly from the consumer??
    subgraphNotificationCounter // where do we get this, directly from the consumer??
  } = vProofArgs || {};

  
  const type = {
    Data: [{ name: 'data', type: 'string' }]
  };
  const domain = {
    name: 'EPNS COMM V1',
    chainId: chainId,
    verifyingContract: verifyingContract,
  };
  let message = null;
  const uuid = getUUID();

  if (storage === STORAGE_TYPE.SMART_CONTRACT) {
    return `eip155:${chainId}:${txHash}::uid::${uuid}`;
  } else if (storage === STORAGE_TYPE.IPFS) {
    message = {
      data: `1+${ipfsHash}`,
    };
    const signature = signer._signTypedData(domain, type, message);
    return `eip712v2:${signature}::uid::${uuid}`;
  } else if (storage === STORAGE_TYPE.DIRECT_PAYLOAD) {
    message = {
      data: `2+${JSON.stringify(payload)}`,
    };
    const signature = signer._signTypedData(domain, type, message);
    return `eip712v2:${signature}::uid::${uuid}`;
  } else if (storage === STORAGE_TYPE.SUBGRAPH) {
    return `graph:${subgraphId}+${subgraphNotificationCounter}::uid::${uuid}`;
  }
}

export function getPayloadIdentity(identityArgs: {
  storage: number,
  payload: INotificationPayload,
  notificationType?: number,
  ipfsHash?: string,
  subgraphId?: string,
  subgraphNotificationCounter?: number
}) {

  const {
    storage,
    payload,
    notificationType,
    ipfsHash,
    subgraphId, // where do we get this, directly from the consumer??
    subgraphNotificationCounter // where do we get this, directly from the consumer??
  } = identityArgs || {};

  if (storage === STORAGE_TYPE.SMART_CONTRACT) {
    return `0+${notificationType}+${payload.notification.title}+${payload.notification.body}`;
  } else if (storage === STORAGE_TYPE.IPFS) {
    return `1+${ipfsHash}`
  } else if (storage === STORAGE_TYPE.DIRECT_PAYLOAD) {
    return `2+${JSON.stringify(payload)}`;
  } else if (storage === STORAGE_TYPE.SUBGRAPH) {
    return `3+graph:${subgraphId}+${subgraphNotificationCounter}`;
  }
}

export function getSource(chainId: number, storage: number) {
  if (storage === STORAGE_TYPE.SUBGRAPH) {
    SOURCE_TYPES.THE_GRAPH;
  }
  return CHAIN_ID_TO_SOURCE[chainId];
}