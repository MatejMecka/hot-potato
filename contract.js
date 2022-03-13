const { Server, Networks, TransactionBuilder, Operation, Asset, Keypair } = require('stellar-sdk')
const server = new Server("https://horizon-testnet.stellar.org")
require('dotenv').config()

const NFT_ASSET = new Asset("hOtPotato", process.env.PUBLIC_KEY)
const TIMEBOUNDS = 2

function queryTrades(person, search_time_bounds = false) {
    let cursor = ''
    return new Promise(function(resolve, reject){
        server.trades().forAccount(person).cursor(cursor).limit(200).call().then(function(trades) {
                trades = trades["records"]
                if(!search_time_bounds){
                    for(let trade = 0; trade < trades.length; trade++){ 
                        if(trades[trade]["counter_asset_code"] == NFT_ASSET.code && trades[trade]["counter_asset_issuer"] == NFT_ASSET.issuer ){
                            console.log("ASSET FOUND IN RECIEVER!")
                            reject(Error("Already owned"))
                        }
                    }
                } 

                else {
                    for(let trade = 0; trade < trades.length; trade++){
                        if( (trades[trade]["counter_asset_code"] == NFT_ASSET.code ||  trades[trade]["base_asset_type"] == NFT_ASSET.code) &&  (trades[trade]["counter_asset_issuer"] == NFT_ASSET.issuer || trades[trade]["base_asset_issuer"] == NFT_ASSET.issuer) ){
                            const trade_date = new Date(trades[trade]["ledger_close_time"])
                            const date_diff = new Date() - trade_date
                            const diffDays = Math.ceil(date_diff / (1000 * 60 * 60 * 24));
                            console.log(diffDays < TIMEBOUNDS)

                            if (diffDays > TIMEBOUNDS){
                                reject(Error("Expired"))
                            } else {
                                console.log("Asset hasn't expired")
                                resolve(true)
                                return true;
                            }
                        }
                }           
            }
            resolve(true)
        }).catch(err => {
          reject(Error("Network Request Failed"))
        });
    })
}


module.exports.getXDR = async (body) => {
  return new Promise(async function(resolve, reject){
      const { source: person_who_holds_the_potato, destination: person_who_gets_the_potato } = body

      console.log(person_who_holds_the_potato)
      console.log(person_who_gets_the_potato)
    
      try {
        Keypair.fromPublicKey(person_who_holds_the_potato)
      } catch (err) {
        reject(Error("Invalid Public Key for Source"))
      }
    
      try {
        Keypair.fromPublicKey(person_who_gets_the_potato)
      } catch (err) {
        reject(Error("Invalid Public Key for Destination"))
      }

      // We need to transfer the potato from the source to the destination
      if(!person_who_holds_the_potato || !person_who_gets_the_potato) {
          reject(Error("Missing source or destination"))
      }

      // No passing to the same account
      if (person_who_holds_the_potato === person_who_gets_the_potato) {
          reject(Error("Source and destination cannot be the same"))
      }


      const account = await server.loadAccount(person_who_holds_the_potato);
      const fee = await server.fetchBaseFee();
      let transaction = new TransactionBuilder(account, { fee, networkPassphrase: Networks.TESTNET })


      // Check if the Asset is issued
      server.assets().forCode(NFT_ASSET.code).forIssuer(NFT_ASSET.issuer).call().then(async function(asset) {
          if(asset["records"].length === 0){
              console.log("Asset not issued yet")            
              // Not issued  

              // 1. Mint the Asset
              transaction.addOperation(
                  Operation.setOptions({
                  setFlags: 15, // This is where we configure the NFT we're about the issue as an auth required asset
                  source: NFT_ASSET.issuer
              }))

              // 2. Finally the other person can accept it.
              transaction.addOperation(Operation.changeTrust({
                  asset: NFT_ASSET,
                  limit: "1"
              }))

              const WINNER_NFT_ASSET = new Asset("Potat", process.env.PUBLIC_KEY)

              transaction.addOperation(
                  Operation.changeTrust({
                      asset: WINNER_NFT_ASSET,
                      limit: "1"
                  })
              )

              transaction.addOperation(
                  Operation.setTrustLineFlags({ // This is the first authorization open operation for the new NFT allowing it to be minted from the issuing account to the mint/royalty user account
                  trustor: person_who_holds_the_potato,
                  asset: NFT_ASSET,
                  flags: {
                    authorized: true
                  },
                  source: NFT_ASSET.issuer
                }))

              transaction.addOperation(
                  Operation.setTrustLineFlags({ // This is the first authorization open operation for the new NFT allowing it to be minted from the issuing account to the mint/royalty user account
                  trustor: person_who_holds_the_potato,
                  asset: WINNER_NFT_ASSET,
                  flags: {
                    authorized: true
                  },
                  source: WINNER_NFT_ASSET.issuer
              }))

              transaction.addOperation(
                  Operation.manageSellOffer({
                      selling: NFT_ASSET,
                      buying: Asset.native(),
                      amount: "0.0000001",
                      price: "1",
                      offerId: "0",
                      //source: process.env.TEMP_DISTRIBUTOR_PUBLIC_KEY
                      source: NFT_ASSET.issuer
                  })
              )

              transaction.addOperation(
                  Operation.manageBuyOffer({
                      buying: NFT_ASSET,
                      selling: Asset.native(),
                      buyAmount: "0.0000001",
                      price: "3",
                      offerId: "0",
                  })
              )

              transaction.addOperation(Operation.payment({
                  asset: WINNER_NFT_ASSET,
                  amount: "0.0000001",
                  destination: person_who_holds_the_potato,
                  source: NFT_ASSET.issuer
              }))

              transaction.addOperation(
                  Operation.setTrustLineFlags({ // Now that the payment for the NFT has been made we close the authorization effectively locking down the NFT into the user account where they may now hold the NFT but not sell it unless they do so through the authorized/official `offer.js` contract
                      trustor: person_who_holds_the_potato,
                      asset: NFT_ASSET,
                      flags: {
                          authorized: false
                      },
                      source: NFT_ASSET.issuer
              }))

              transaction.addOperation(Operation.manageData({
                  name: "currentAccount",
                  value: person_who_gets_the_potato,
                  source: NFT_ASSET.issuer
              }))

                transaction.setTimeout(0)
                transaction = transaction.build()
                transaction.sign(Keypair.fromSecret(process.env.PRIV_KEY));
                console.log(transaction.toXDR())
                resolve(transaction.toXDR())
                return transaction.toXDR()

          }

          else { 
              // Asset is issued
              // Check if owned already

              console.log("ASSET IS ISSUED!")


              console.log("SEARCHING FOR OWNERSHIP OF ASSET")
              await queryTrades(person_who_gets_the_potato, false).catch(err => {
                  console.log(err)
                  reject(Error("Already owned"))
              })

              // Check if timebounds are valid
              queryTrades(person_who_holds_the_potato, true).then(data => {
                  // Transfer the potato
                  // 1. Approve of transfer
                  transaction.addOperation(
                      Operation.setTrustLineFlags({
                          trustor: person_who_holds_the_potato,
                          asset: NFT_ASSET,
                          flags: {
                              authorized: true,
                          },
                          source: NFT_ASSET.issuer
                      }),
                  )

                  // 2. Establiish trustline
                  transaction.addOperation(
                      Operation.changeTrust({
                          asset: NFT_ASSET,
                          limit: '1',
                          source: person_who_gets_the_potato
                      }),
                  )

                  transaction.addOperation(
                      Operation.setTrustLineFlags({
                      trustor: person_who_gets_the_potato,
                      asset: NFT_ASSET,
                      flags: {
                          authorized: true,
                      },
                      source: NFT_ASSET.issuer
                  }),
                  )

                  // 3. Transfer the Asset
                  transaction.addOperation(
                      Operation.manageSellOffer({
                          selling: NFT_ASSET,
                          buying: Asset.native(),
                          amount: "0.0000001",
                          price: "1",
                          offerId: "0",
                          source: person_who_holds_the_potato
                      })
                  )

                  transaction.addOperation(
                      Operation.manageBuyOffer({
                          buying: NFT_ASSET,
                          selling: Asset.native(),
                          buyAmount: "0.0000001",
                          price: "3",
                          offerId: "0",
                          source: person_who_gets_the_potato
                      })
                  )

                  // 4. Lock the NFT to the user again
                  transaction.addOperation(
                      Operation.setTrustLineFlags({ // Now that the payment for the NFT has been made we close the authorization effectively locking down the NFT into the user account where they may now hold the NFT but not sell it unless they do so through the authorized/official `offer.js` contract
                          trustor: person_who_gets_the_potato,
                          asset: NFT_ASSET,
                          flags: {
                              authorized: false
                          },
                          source: NFT_ASSET.issuer
                  }))

                  // 5. Update the Account

                  transaction.addOperation(Operation.manageData({
                      name: "currentAccount",
                      value: person_who_gets_the_potato,
                      source: NFT_ASSET.issuer
                  }))

                  transaction.setTimeout(0)
                  transaction = transaction.build()
                  transaction.sign(Keypair.fromSecret(process.env.PRIV_KEY));
                  console.log(transaction.toXDR())
                  resolve(transaction.toXDR())
                  return transaction.toXDR()
              }).catch(err => {
                  console.log(err)
              })

          }
      })

  });
}
