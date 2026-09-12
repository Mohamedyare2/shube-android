package com.geesh.app.local

import android.content.Context
import androidx.room.*

// ─── Entity ───────────────────────────────────────────────────────────────────
@Entity(tableName = "processed_transactions")
data class ProcessedTransaction(
    @PrimaryKey val tixraac: String,       // Unique transaction reference — prevents duplicates
    val amountDollar: Double,
    val smsBody: String,
    val processedAt: Long = System.currentTimeMillis(),
    val ussdResult: String = "pending"    // pending | success | failed | unknown
)

// ─── DAO ──────────────────────────────────────────────────────────────────────
@Dao
interface TransactionDao {
    @Query("SELECT * FROM processed_transactions WHERE tixraac = :tixraac LIMIT 1")
    suspend fun findByTixraac(tixraac: String): ProcessedTransaction?

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(tx: ProcessedTransaction): Long  // Returns -1 if already exists (duplicate)

    @Query("UPDATE processed_transactions SET ussdResult = :result WHERE tixraac = :tixraac")
    suspend fun updateResult(tixraac: String, result: String)

    @Query("SELECT * FROM processed_transactions ORDER BY processedAt DESC LIMIT 50")
    suspend fun getRecent(): List<ProcessedTransaction>
}

// ─── Database ─────────────────────────────────────────────────────────────────
@Database(entities = [ProcessedTransaction::class], version = 1, exportSchema = false)
abstract class GeeshDatabase : RoomDatabase() {
    abstract fun transactionDao(): TransactionDao

    companion object {
        @Volatile private var INSTANCE: GeeshDatabase? = null

        fun getInstance(context: Context): GeeshDatabase {
            return INSTANCE ?: synchronized(this) {
                Room.databaseBuilder(context.applicationContext, GeeshDatabase::class.java, "geesh_db")
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}
