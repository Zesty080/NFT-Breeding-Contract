const anchor = require('@project-serum/anchor');
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");

const fs = require('fs');
const path = require('path');
const os = require("os");

const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../target/idl/nft_breed.json')));
const programID = new anchor.web3.PublicKey(idl.metadata.address);

const walletKeyData = JSON.parse(fs.readFileSync(os.homedir() + '/.config/solana/id.json'));
const walletKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(walletKeyData));
const wallet = new anchor.Wallet(walletKeypair);

const connection = new anchor.web3.Connection(process.env.ANCHOR_PROVIDER_URL);

function getProvider() {
  const provider = new anchor.Provider(
      connection, wallet, { preflightCommitment: "processed" },
  );
  return provider;
};
const provider = getProvider();
let program = new anchor.Program(idl, programID, provider);
let feeMintObject;
let feeTokenPubkey;
let feeMintPubkey = new anchor.web3.PublicKey('D9DaGmpuzqzYnr4qxXP7EZCu9h1RE47eu3XnayB1e9oZ');
let poolKeypair;
const initializeMints = async () => {
  console.log("Program ID: ", programID.toString());
  console.log("Wallet: ", provider.wallet.publicKey.toString());

  feeMintObject = new Token(provider.connection, feeMintPubkey, TOKEN_PROGRAM_ID, provider.wallet.payer);
  
  const poolRawData = fs.readFileSync('json/pool.json');
  poolKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(poolRawData)));

  let feeTokenAccountInfo = await feeMintObject.getOrCreateAssociatedAccountInfo(provider.wallet.publicKey);
  feeTokenPubkey = feeTokenAccountInfo.address;
}

const initializePool = async () => {
    await initializeMints();
    const [
          _poolSigner,
          _nonce,
      ] = await anchor.web3.PublicKey.findProgramAddress(
          [poolKeypair.publicKey.toBuffer()],
          program.programId
      );
      let poolSigner = _poolSigner;
      let poolNonce = _nonce;

      feeTokenPoolVault = await feeMintObject.createAccount(poolSigner);

      await program.rpc.initialize(
          poolNonce,
          new anchor.BN(anchor.web3.LAMPORTS_PER_SOL),
          {
              accounts: {
                  authority: provider.wallet.publicKey,
                  breedFeeTokenVault: feeTokenPoolVault,
                  breedFeeTokenMint: feeMintPubkey,
                  breedSigner: poolSigner,
                  breed: poolKeypair.publicKey,
                  tokenProgram: TOKEN_PROGRAM_ID,
                  systemProgram: anchor.web3.SystemProgram.programId,
              },
              signers: [poolKeypair],
              instructions: [
                  await program.account.breed.createInstruction(poolKeypair, ),
              ],
          }
      );
    console.log("Successfully initialized!");
}

initializePool();