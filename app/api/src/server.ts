import "dotenv/config"
import app from "./app.js"
import { connectDB } from "./config/database.js"
import { error } from "node:console"

const port = Number(process.env.PORT ?? 4000)

async function startServer(){
    await connectDB()

    app.listen(port, ()=>{
        console.log(`API running at http://localhost:${port}`)
    })
}

startServer().catch((error: unknown)=>{
    console.error("Failed to start API", error)
    process.exit(1);
})