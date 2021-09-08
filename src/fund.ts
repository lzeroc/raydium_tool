import {
    Account,
    AccountInfo,
    Commitment,
    SystemProgram,
    Transaction,
    TransactionSignature,
    TransactionInstruction,
    PublicKey,
    Connection,
    ParsedAccountData,
} from '@solana/web3.js'

import { derivePath } from 'ed25519-hd-key';
import * as Bip39 from 'bip39'
import nacl from 'tweetnacl'
import { FARMS, getAddressForWhat, getFarmByPoolId } from './utils/farms'
import { ACCOUNT_LAYOUT, getBigNumber } from './utils/layouts'
import { commitment, getFilteredProgramAccounts, getMultipleAccounts } from './utils/web3'
import {
    STAKE_INFO_LAYOUT,
    STAKE_INFO_LAYOUT_V4,
    USER_STAKE_INFO_ACCOUNT_LAYOUT,
    USER_STAKE_INFO_ACCOUNT_LAYOUT_V4
} from './utils/stake'
import { TokenAmount, lt } from './utils/safe-math'
import { LP_TOKENS, TOKENS, TokenInfo, NATIVE_SOL } from './utils/tokens'
import { IdoPool, IDO_POOLS, IDO_LOTTERY_SNAPSHOT_DATA_LAYOUT, findAssociatedIdoInfoAddress, findAssociatedIdoCheckAddress, IDO_LOTTERY_USER_INFO_LAYOUT, IDO_USER_INFO_LAYOUT, IdoUserInfo, IDO_LOTTERY_POOL_INFO_LAYOUT, IDO_POOL_INFO_LAYOUT, IdoPoolInfo, purchase, getIdoPoolById, claim, IdoLotteryUserInfo, IdoLotteryPoolInfo } from './utils/ido'
import { get as safeGet, cloneDeep } from 'lodash'
import { getUnixTs } from './utils'
import { TOKEN_PROGRAM_ID, STAKE_PROGRAM_ID, STAKE_PROGRAM_ID_V4, STAKE_PROGRAM_ID_V5 } from './utils/ids'

async function requestInfos(conn: any, ownerPublicKey: string) {
    const idoPools: Array<IdoPool> = cloneDeep(IDO_POOLS)
    const publicKeys: Array<PublicKey> = []

    const keys = ['idoId']
    const keyLength = keys.length

    idoPools.forEach((pool) => {
        const { idoId } = pool

        publicKeys.push(new PublicKey(idoId))
    })

    const multipleInfo = await getMultipleAccounts(conn, publicKeys, commitment)
    multipleInfo.forEach((info, index) => {
        if (info) {
            const poolIndex = parseInt((index / keyLength).toString())

            const data = Buffer.from(info.account.data)

            const pool = idoPools[poolIndex]

            if (pool.version === 3) {
                const decoded = IDO_LOTTERY_POOL_INFO_LAYOUT.decode(data)
                pool.info = {
                    status: getBigNumber(decoded.status),
                    nonce: getBigNumber(decoded.nonce),
                    startTime: getBigNumber(decoded.startTime),
                    endTime: getBigNumber(decoded.endTime),
                    startWithdrawTime: getBigNumber(decoded.startWithdrawTime),
                    numerator: getBigNumber(decoded.numerator),
                    denominator: getBigNumber(decoded.denominator),
                    quoteTokenDeposited: new TokenAmount(getBigNumber(decoded.quoteTokenDeposited), pool.quote.decimals),
                    baseTokenSupply: new TokenAmount(getBigNumber(decoded.baseTokenSupply), pool.base.decimals),
                    perUserMaxLottery: getBigNumber(decoded.perUserMaxLottery),
                    perUserMinLottery: getBigNumber(decoded.perUserMinLottery),
                    perLotteryNeedMinStake: getBigNumber(decoded.perLotteryNeedMinStake),
                    perLotteryWorthQuoteAmount: new TokenAmount(
                        getBigNumber(decoded.perLotteryWorthQuoteAmount),
                        pool.quote.decimals
                    ),
                    totalWinLotteryLimit: getBigNumber(decoded.totalWinLotteryLimit),
                    totalDepositUserNumber: getBigNumber(decoded.totalDepositUserNumber),
                    currentLotteryNumber: getBigNumber(decoded.currentLotteryNumber),
                    luckyInfos: decoded.luckyInfos.map((obj: any[]) =>
                        Object.entries(obj).reduce((acc, [key, value]) => ({ ...acc, [key]: getBigNumber(value) }), {})
                    ),
                    quoteTokenMint: decoded.quoteTokenMint,
                    baseTokenMint: decoded.baseTokenMint,
                    quoteTokenVault: decoded.quoteTokenVault,
                    baseTokenVault: decoded.baseTokenVault,
                    stakePoolId: decoded.stakePoolId,
                    stakeProgramId: decoded.stakeProgramId,
                    checkProgramId: decoded.checkProgramId,
                    idoOwner: decoded.idoOwner,
                    poolSeedId: decoded.poolSeedId
                } as IdoLotteryPoolInfo
            } else {
                const decoded = IDO_POOL_INFO_LAYOUT.decode(data)
                pool.info = {
                    startTime: getBigNumber(decoded.startTime),
                    endTime: getBigNumber(decoded.endTime),
                    startWithdrawTime: getBigNumber(decoded.startWithdrawTime),

                    minDepositLimit: new TokenAmount(getBigNumber(decoded.minDepositLimit), pool.quote.decimals),
                    maxDepositLimit: new TokenAmount(getBigNumber(decoded.maxDepositLimit), pool.quote.decimals),
                    stakePoolId: decoded.stakePoolId,
                    minStakeLimit: new TokenAmount(getBigNumber(decoded.minStakeLimit), TOKENS.RAY.decimals),
                    quoteTokenDeposited: new TokenAmount(getBigNumber(decoded.quoteTokenDeposited), pool.quote.decimals)
                } as IdoPoolInfo
            }
            pool.status =
                pool.info.endTime < getUnixTs() / 1000
                    ? 'ended'
                    : pool.info.startTime < getUnixTs() / 1000
                        ? 'open'
                        : 'upcoming'
        }
    })
    const pools = await getIdoAccounts(conn, ownerPublicKey, idoPools);
    return pools;
}

async function getIdoAccounts(conn: any, ownerPublicKey: string, pools: any) {
    const idoPools: Array<IdoPool> = pools

    const publicKeys: Array<PublicKey> = []

    const keys = ['idoAccount', 'idoCheck']
    const keyLength = keys.length

    for (const pool of idoPools) {
        const { idoId, programId, version, snapshotProgramId, seedId } = pool

        const userIdoAccount = await findAssociatedIdoInfoAddress(
            new PublicKey(idoId),
            new PublicKey(ownerPublicKey),
            new PublicKey(programId)
        )
        const userIdoCheck = await findAssociatedIdoCheckAddress(
            new PublicKey(version === 1 ? idoId : seedId!),
            new PublicKey(ownerPublicKey),
            new PublicKey(snapshotProgramId)
        )

        publicKeys.push(userIdoAccount, userIdoCheck)
    }

    const multipleInfo = await getMultipleAccounts(conn, publicKeys, commitment)
    multipleInfo.forEach((info, index) => {
        const poolIndex = parseInt((index / keyLength).toString())
        const keyIndex = index % keyLength
        const key = keys[keyIndex]

        if (info) {
            // const address = info.publicKey.toBase58()
            const data = Buffer.from(info.account.data)

            const pool = idoPools[poolIndex]

            switch (key) {
                case 'idoAccount': {
                    if (!pool.userInfo) {
                        pool.userInfo = {} as IdoUserInfo
                    }
                    if (pool.version === 3) {
                        const decoded = IDO_LOTTERY_USER_INFO_LAYOUT.decode(data)
                            ; (pool.userInfo as IdoLotteryUserInfo).quoteTokenDeposited = getBigNumber(decoded.quoteTokenDeposited)
                            ; (pool.userInfo as IdoLotteryUserInfo).quoteTokenWithdrawn = getBigNumber(decoded.quoteTokenWithdrawn)
                            ; (pool.userInfo as IdoLotteryUserInfo).baseTokenWithdrawn = getBigNumber(decoded.baseTokenWithdrawn)
                            ; (pool.userInfo as IdoLotteryUserInfo).lotteryBeginNumber = getBigNumber(decoded.lotteryBeginNumber)
                            ; (pool.userInfo as IdoLotteryUserInfo).lotteryEndNumber = getBigNumber(decoded.lotteryEndNumber)
                    }
                    const decoded = IDO_USER_INFO_LAYOUT.decode(data)
                        ; (pool.userInfo as IdoUserInfo).deposited = new TokenAmount(
                            getBigNumber(decoded.quoteTokenDeposited),
                            pool.quote.decimals
                        )
                    break
                }
                case 'idoCheck': {
                    if (!pool.userInfo) {
                        pool.userInfo = {} as IdoLotteryUserInfo
                    }
                    if (pool.version === 3) {
                        const decoded = IDO_LOTTERY_SNAPSHOT_DATA_LAYOUT.decode(data)
                            ; (pool.userInfo as IdoLotteryUserInfo).eligibleTicketAmount = getBigNumber(
                                decoded.eligibleTicketAmount
                            )
                    }
                    pool.userInfo.snapshoted = true
                    break
                }
            }
        }
    })
    return idoPools
}

async function depositedTickets(pool: any) {
    const begin = (pool.userInfo as IdoLotteryUserInfo)?.lotteryBeginNumber
    const end = (pool.userInfo as IdoLotteryUserInfo)?.lotteryEndNumber    

    return begin && end ? Array.from({ length: end - begin + 1 }, (_, i) => begin + i) : []
}

async function winningTickets(pool: any) {
    let temp = await depositedTickets(pool);
    var res = temp.filter((ticket: any) => isTicketWin(ticket, pool))

    return {
        res,
        temp
    }
}

function isTicketWin(ticketNumber: number, pool: any): boolean {
    const luckyInfos = (pool.info as IdoLotteryPoolInfo).luckyInfos
    const isTargeted = luckyInfos.some(
        ({ luckyTailDigits, luckyTailNumber, luckyWithinNumber }) =>
            luckyTailDigits &&
            ticketNumber <= luckyWithinNumber &&
            String(ticketNumber)
                .padStart(luckyTailDigits, '0')
                .endsWith(String(luckyTailNumber).padStart(luckyTailDigits, '0'))
    )
    return getWinProperty(pool) < 0.5 ? isTargeted : !isTargeted
}

function getWinProperty(pool: any): number {
    const luckyInfos = (pool.info as IdoLotteryPoolInfo).luckyInfos
    const totalWinAmount = luckyInfos.reduce((acc, { luckyNumberExist }) => acc + luckyNumberExist, 0)
    return totalWinAmount / (pool.info as IdoLotteryPoolInfo).currentLotteryNumber
}

export async function query(ownerPublicKey: string) {
    const conn = new Connection('https://solana-api.projectserum.com', 'recent');

    let pools = await requestInfos(conn, ownerPublicKey);
    const pool = pools.find((pool: any) => pool.idoId === 'E4CvLEhwih2BekPtoAExKg4hFDxAnKGehC8nsEiKVoJy')
    let { res, temp } = await winningTickets(pool);
    
    return {
        allCount: temp.length,
        winCount: res.length,
        address: ownerPublicKey
    };
}
