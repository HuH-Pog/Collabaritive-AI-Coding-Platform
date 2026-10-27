import mongoose from "mongoose" 
import { ur } from "zod/locales"


export async function connectDB(): Promise<void>{
    const uri = process.env.MONGODB_URI

    if(!uri){
        throw new Error("MONGODB_URI is missing from .env file")
    }

    await mongoose.connect(uri);
    console.log("MongoDB Connected");
}