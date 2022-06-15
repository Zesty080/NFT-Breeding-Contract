const anchor = require('@project-serum/anchor');
const { TOKEN_PROGRAM_ID, Token, AccountLayout } = require("@solana/spl-token");

const fs = require('fs');
const path = require('path');
const os = require("os");

const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../target/idl/nft_breed.json')));
const programID = new anchor.web3.PublicKey(idl.metadata.address);

const walletKeyData = JSON.parse(fs.readFileSync(os.homedir() + '/.config/solana/id.json'));
const walletKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(walletKeyData));
const wallet = new anchor.Wallet(walletKeypair);

let ANCHOR_PROVIDER_URL = 'https://ssc-dao.genesysgo.net';
const argv = process.argv;
let values = [];
for (var i = 3; i < argv.length; i++) {
    if (argv[i].indexOf('--') == -1) {
        values.push(argv[i]);
    }
}

if (argv.indexOf('--env') > -1) {
    const env = argv[argv.indexOf('--env') + 1];
    if (env == 'devnet') {
        ANCHOR_PROVIDER_URL = 'https://api.devnet.solana.com';
    } else if (env == 'localnet') {
        ANCHOR_PROVIDER_URL = 'http://localhost:8899';
    }
}

const connection = new anchor.web3.Connection(ANCHOR_PROVIDER_URL);

function getProvider() {
    const provider = new anchor.Provider(
        connection, wallet, { preflightCommitment: "processed" },
    );
    return provider;
};
const provider = getProvider();
let program = new anchor.Program(idl, programID, provider);
const poolRawData = fs.readFileSync('json/pool.json');
let poolKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(poolRawData)));

console.log("Program ID: ", programID.toString());
console.log("Wallet: ", provider.wallet.publicKey.toString());

async function addSingleNft() {
    if (!values[0]) {
        console.log('Missing some arguments.\n\nyarn add_single_nft <NFT_MINT_ID>');
        return;
    }

    const nftMint = new anchor.web3.PublicKey(values[0]);
    const [
        poolSigner,
        _nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [poolKeypair.publicKey.toBuffer()],
        program.programId
    );

    const child = new Token(provider.connection, nftMint, TOKEN_PROGRAM_ID, provider.wallet.payer);
    let childA;
    let from = await child.getOrCreateAssociatedAccountInfo(provider.wallet.publicKey);
    const nftAccounts = await provider.connection.getTokenAccountsByOwner(poolSigner, { mint: nftMint });
    if (nftAccounts.value.length == 0) {
        childA = await child.createAccount(poolSigner);
    }
    else {
        childA = nftAccounts.value[0].pubkey;
    }

    let instructions = [];
    instructions.push(
        Token.createTransferInstruction(
            TOKEN_PROGRAM_ID,
            from,
            childA,
            provider.wallet.publicKey,
            [],
            1
        )
    );

    const transaction = new anchor.web3.Transaction().add(...instructions);
    var signature = await anchor.web3.sendAndConfirmTransaction(
        provider.connection,
        transaction,
        [provider.wallet.payer]
    );
    console.log(signature);
}

async function addMultipleNft() {
    if (!values[0]) {
        console.log('Missing some arguments.\n\nyarn add_multiple_nft <NFT_MINT_IDS_PATH>');
        return;
    }

    const nfts = JSON.parse(fs.readFileSync(values[0]));

    const [
        poolSigner,
        _nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [poolKeypair.publicKey.toBuffer()],
        program.programId
    );

    console.log(poolSigner.toBase58())

    for (let i = 0; i < nfts.length; i++) {
        try {
            let instructions = [];
            const nft = nfts[i];
            const nftMint = new anchor.web3.PublicKey(nft);
            const child = new Token(provider.connection, nftMint, TOKEN_PROGRAM_ID, provider.wallet.payer);
            let childA;
            let from = await child.getOrCreateAssociatedAccountInfo(provider.wallet.publicKey);
            const nftFromAccounts = await provider.connection.getTokenAccountsByOwner(provider.wallet.publicKey, { mint: nftMint });
            if (nftFromAccounts.value.length === 0) {
                continue;
            }

            if (nftFromAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount === 0) {
                continue;
            }

            const nftAccounts = await provider.connection.getTokenAccountsByOwner(poolSigner, { mint: nftMint });
            if (nftAccounts.value.length == 0) {
                childA = anchor.web3.Keypair.generate().publicKey;
                const balanceNeeded = await Token.getMinBalanceRentForExemptAccount(provider.connection);
                instructions.push(anchor.web3.SystemProgram.createAccount({
                    fromPubkey: provider.wallet.publicKey,
                    newAccountPubkey: childA,
                    lamports: balanceNeeded,
                    space: AccountLayout.span,
                    programId: TOKEN_PROGRAM_ID
                }))

                instructions.push(Token.createInitAccountInstruction(TOKEN_PROGRAM_ID, nftMint, childA, poolSigner))
            }
            else {
                childA = nftAccounts.value[0].pubkey;
            }

            instructions.push(
                Token.createTransferInstruction(
                    TOKEN_PROGRAM_ID,
                    from.address,
                    childA,
                    provider.wallet.publicKey,
                    [],
                    1
                )
            );
            const transaction = new anchor.web3.Transaction().add(...instructions);
            var signature = await anchor.web3.sendAndConfirmTransaction(
                provider.connection,
                transaction,
                [provider.wallet.payer]
            );
            console.log(signature)

        } catch (e) {

        }
    }
}

async function sendAllNfts() {
    if (!values[0] || !values[1]) {
        console.log('Missing some arguments.\n\nyarn transfer_nfts <RECEIVER_WALLET_PUBKEY> <NFT_MINT_IDS_PATH>');
        return;
    }

    const receiver = new anchor.web3.PublicKey(values[0]);
    const nfts = JSON.parse(fs.readFileSync(values[1]));

    let instructions = [];
    nfts.map(async (nft) => {
        const nftMint = new anchor.web3.PublicKey(nft);
        const child = new Token(provider.connection, nftMint, TOKEN_PROGRAM_ID, provider.wallet.payer);
        let from = await child.getOrCreateAssociatedAccountInfo(provider.wallet.publicKey);
        let to = await child.createAssociatedTokenAccount(receiver);

        instructions.push(
            Token.createTransferInstruction(
                TOKEN_PROGRAM_ID,
                from.address,
                to,
                provider.wallet.publicKey,
                [],
                1
            )
        );
    })
    const transaction = new anchor.web3.Transaction().add(...instructions);
    var signature = await anchor.web3.sendAndConfirmTransaction(
        provider.connection,
        transaction,
        [provider.wallet.payer]
    );
}

const commandID = argv.indexOf('--command_id=1') > -1 ? 1 :
    argv.indexOf('--command_id=2') > -1 ? 2 :
        argv.indexOf('--command_id=3') > -1 ? 3 : -1;
switch (commandID) {
    case 1:
        addSingleNft();
        break;
    case 2:
        addMultipleNft();
        break;
    case 3:
        sendAllNfts();
        break;
    default:
        console.log('Unrecognized command');
        break;
}