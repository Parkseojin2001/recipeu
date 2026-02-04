# app/database.py

import os
from motor.motor_asyncio import AsyncIOMotorClient


MONGODB_URL = os.getenv(
    "MONGODB_URL", "mongodb://root:RootPassword123@136.113.251.237:27017"
)

DATABASE_NAME = os.getenv("DATABASE_NAME", "recipe_db")


client = AsyncIOMotorClient(MONGODB_URL)
db = client[DATABASE_NAME]


def get_db():
    return db
