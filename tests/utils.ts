import * as anchor from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, Token, MintLayout } from "@solana/spl-token";

async function initializeProgram(program, provider, authMintPubkey) {
    const [ _configPubkey, _nonce] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("config")], program.programId);
    configPubkey = _configPubkey;
    let nonce = _nonce;
    await program.rpc.initializeProgram(
        nonce,
        authMintPubkey,
        {
            accounts: {
                config: configPubkey,
                payer: provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        }
    )
}

async function createMint(provider, decimals) {
    const mint = await Token.createMint(
        provider.connection,
        provider.wallet.payer,
        provider.wallet.publicKey,
        null,
        decimals,
        TOKEN_PROGRAM_ID
    );
    return mint;
}

async function createMintAndVault(provider, vaultOwner, decimals) {
    const mint = await createMint(provider);

    const vault = await mint.createAccount(vaultOwner ? vaultOwner : provider.wallet.publicKey);
    return [mint, vault];
}

async function createMintFromPriv(
    mintAccount,
    provider,
    mintAuthority,
    freezeAuthority,
    decimals,
    programId,
) {
    const token = new Token(
        provider.connection,
        mintAccount.publicKey,
        programId,
        provider.wallet.payer,
      );
  
    // Allocate memory for the account
    const balanceNeeded = await Token.getMinBalanceRentForExemptMint(
        provider.connection,
    );

    const transaction = new anchor.web3.Transaction();
    transaction.add(
        anchor.web3.SystemProgram.createAccount({
            fromPubkey: provider.wallet.payer.publicKey,
            newAccountPubkey: mintAccount.publicKey,
            lamports: balanceNeeded,
            space: MintLayout.span,
            programId,
        }),
    );

    transaction.add(
        Token.createInitMintInstruction(
            programId,
            mintAccount.publicKey,
            decimals,
            mintAuthority,
            freezeAuthority,
        ),
    );
  
    await provider.send(transaction, [mintAccount]);
    return token;
}

async function mintToAccount(
    provider,
    mint,
    destination,
    amount
) {
    const tx = new anchor.web3.Transaction();
    tx.add(
      Token.createMintToInstruction(
        TOKEN_PROGRAM_ID,
        mint,
        destination,
        provider.wallet.publicKey,
        [],
        amount
      )
    );
    await provider.send(tx);
}

async function sendLamports(
    provider,
    destination,
    amount
) {
    const tx = new anchor.web3.Transaction();
    tx.add(
        anchor.web3.SystemProgram.transfer(
            { 
                fromPubkey: provider.wallet.publicKey, 
                lamports: amount, 
                toPubkey: destination
            }
        )
    );
    await provider.send(tx);
}

async function createNFT(provider, owner) {
    //create new token mint
    let mint = await Token.createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID,
    );

    let nftAccount = await mint.getOrCreateAssociatedAccountInfo(
      owner,
    );

    await mint.mintTo(
      nftAccount.address,
      owner,
      [],
      1,
    );

    await mint.setAuthority(
      mint.publicKey,
      null,
      "MintTokens",
      owner,
      []
    )

    return {mint: mint.publicKey, nftAccount: nftAccount.address};
}

function getProvider(keypair) {
    let envProvider = anchor.Provider.env();
        envProvider.commitment = 'pending';

    return new anchor.Provider(envProvider.connection, new anchor.Wallet(keypair), envProvider.opts);
}

module.exports = {
    mintToAccount,
    createMintAndVault,
    createMintFromPriv,
    createMint,
    sendLamports,
    initializeProgram,
    createNFT,
    getProvider,
};
