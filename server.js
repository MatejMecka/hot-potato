/**
* This is the main Node.js server script for your project
* Check out the two endpoints this back-end API provides in fastify.get and fastify.post below
*/

const path = require("path");
const contract = require("./contract.js")
const fs = require("fs")

// Require the fastify framework and instantiate it
const fastify = require("fastify")({
  // Set this to true for detailed logging:
  logger: false
});

fastify.register(require('fastify-cors'), { 
  // put your options here
  origin: false,     
})

// ADD FAVORITES ARRAY VARIABLE FROM TODO HERE


// Setup our static files
fastify.register(require("fastify-static"), {
  root: path.join(__dirname, "public"),
  prefix: "/" // optional: default '/'
});

// fastify-formbody lets us parse incoming forms
fastify.register(require("fastify-formbody"));

// point-of-view is a templating manager for fastify
fastify.register(require("point-of-view"), {
  engine: {
    handlebars: require("handlebars")
  }
});

// Load and parse SEO data
const seo = require("./src/seo.json");
if (seo.url === "glitch-default") {
  seo.url = `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
}

/**
* Our home page route
*
* Returns src/pages/index.hbs with data built into it
*/
fastify.get("/", function(request, reply) {
  reply.view("/public/index.html",);
});

/**
* Our POST route to handle and react to form submissions 
*
* Accepts body data indicating the user choice
*/

fastify.get("/generate_xdr", async function(request, reply){
    let source = request.query.source
    let destination = request.query.destination
    
    //console.log(source)
    //console.log(destination)
    let resp = {}
    
    
      contract.getXDR({source: source, destination: destination}).then((data) => {
        console.log(data)
        resp["xdr"] = data

        reply.raw.writeHead(200, { 'Content-Type': 'text/json', 'Access-Control-Allow-Origin': '*' })
        reply.raw.write(JSON.stringify(resp))
        reply.raw.end()

      }).catch(err => {
        resp["err"] = err.toString()
        console.log(err)
        
        reply.raw.writeHead(400, { 'Content-Type': 'text/json', 'Access-Control-Allow-Origin': '*' })
        reply.raw.write(JSON.stringify(resp))
        reply.raw.end()
      })
    
    
  
      /*reply.raw.writeHead(200, { 'Content-Type': 'text/json' })
      reply.raw.write(JSON.stringify({"err": "nesh"}))
      reply.raw.end()*/
  
  
})

fastify.get('/timeline', function(request,reply){
  reply.view("/public/timeline.html")
})

fastify.get('/complete-pass', function(request,reply){
  reply.view("/public/complete_pass.html")
})

fastify.get('/.well-known/stellar.toml', function(request,reply){
  const stream = fs.createReadStream("public/stellar.toml")
  reply.raw.writeHead(200, { 'Access-Control-Allow-Origin': '*' })
  reply.type('text').send(stream)
})

// Run the server and report out to the logs
fastify.listen(process.env.PORT, '0.0.0.0', function(err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Your app is listening on ${address}`);
  fastify.log.info(`server listening on ${address}`);
});
