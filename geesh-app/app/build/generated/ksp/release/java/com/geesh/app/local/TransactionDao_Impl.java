package com.geesh.app.local;

import android.database.Cursor;
import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.CoroutinesRoom;
import androidx.room.EntityInsertionAdapter;
import androidx.room.RoomDatabase;
import androidx.room.RoomSQLiteQuery;
import androidx.room.SharedSQLiteStatement;
import androidx.room.util.CursorUtil;
import androidx.room.util.DBUtil;
import androidx.sqlite.db.SupportSQLiteStatement;
import java.lang.Class;
import java.lang.Exception;
import java.lang.Long;
import java.lang.Object;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import javax.annotation.processing.Generated;
import kotlin.Unit;
import kotlin.coroutines.Continuation;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class TransactionDao_Impl implements TransactionDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<ProcessedTransaction> __insertionAdapterOfProcessedTransaction;

  private final SharedSQLiteStatement __preparedStmtOfUpdateResult;

  public TransactionDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfProcessedTransaction = new EntityInsertionAdapter<ProcessedTransaction>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR IGNORE INTO `processed_transactions` (`tixraac`,`amountDollar`,`smsBody`,`processedAt`,`ussdResult`) VALUES (?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final ProcessedTransaction entity) {
        statement.bindString(1, entity.getTixraac());
        statement.bindDouble(2, entity.getAmountDollar());
        statement.bindString(3, entity.getSmsBody());
        statement.bindLong(4, entity.getProcessedAt());
        statement.bindString(5, entity.getUssdResult());
      }
    };
    this.__preparedStmtOfUpdateResult = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "UPDATE processed_transactions SET ussdResult = ? WHERE tixraac = ?";
        return _query;
      }
    };
  }

  @Override
  public Object insert(final ProcessedTransaction tx,
      final Continuation<? super Long> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Long>() {
      @Override
      @NonNull
      public Long call() throws Exception {
        __db.beginTransaction();
        try {
          final Long _result = __insertionAdapterOfProcessedTransaction.insertAndReturnId(tx);
          __db.setTransactionSuccessful();
          return _result;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object updateResult(final String tixraac, final String result,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfUpdateResult.acquire();
        int _argIndex = 1;
        _stmt.bindString(_argIndex, result);
        _argIndex = 2;
        _stmt.bindString(_argIndex, tixraac);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfUpdateResult.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object findByTixraac(final String tixraac,
      final Continuation<? super ProcessedTransaction> $completion) {
    final String _sql = "SELECT * FROM processed_transactions WHERE tixraac = ? LIMIT 1";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, tixraac);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<ProcessedTransaction>() {
      @Override
      @Nullable
      public ProcessedTransaction call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfTixraac = CursorUtil.getColumnIndexOrThrow(_cursor, "tixraac");
          final int _cursorIndexOfAmountDollar = CursorUtil.getColumnIndexOrThrow(_cursor, "amountDollar");
          final int _cursorIndexOfSmsBody = CursorUtil.getColumnIndexOrThrow(_cursor, "smsBody");
          final int _cursorIndexOfProcessedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "processedAt");
          final int _cursorIndexOfUssdResult = CursorUtil.getColumnIndexOrThrow(_cursor, "ussdResult");
          final ProcessedTransaction _result;
          if (_cursor.moveToFirst()) {
            final String _tmpTixraac;
            _tmpTixraac = _cursor.getString(_cursorIndexOfTixraac);
            final double _tmpAmountDollar;
            _tmpAmountDollar = _cursor.getDouble(_cursorIndexOfAmountDollar);
            final String _tmpSmsBody;
            _tmpSmsBody = _cursor.getString(_cursorIndexOfSmsBody);
            final long _tmpProcessedAt;
            _tmpProcessedAt = _cursor.getLong(_cursorIndexOfProcessedAt);
            final String _tmpUssdResult;
            _tmpUssdResult = _cursor.getString(_cursorIndexOfUssdResult);
            _result = new ProcessedTransaction(_tmpTixraac,_tmpAmountDollar,_tmpSmsBody,_tmpProcessedAt,_tmpUssdResult);
          } else {
            _result = null;
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getRecent(final Continuation<? super List<ProcessedTransaction>> $completion) {
    final String _sql = "SELECT * FROM processed_transactions ORDER BY processedAt DESC LIMIT 50";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<ProcessedTransaction>>() {
      @Override
      @NonNull
      public List<ProcessedTransaction> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfTixraac = CursorUtil.getColumnIndexOrThrow(_cursor, "tixraac");
          final int _cursorIndexOfAmountDollar = CursorUtil.getColumnIndexOrThrow(_cursor, "amountDollar");
          final int _cursorIndexOfSmsBody = CursorUtil.getColumnIndexOrThrow(_cursor, "smsBody");
          final int _cursorIndexOfProcessedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "processedAt");
          final int _cursorIndexOfUssdResult = CursorUtil.getColumnIndexOrThrow(_cursor, "ussdResult");
          final List<ProcessedTransaction> _result = new ArrayList<ProcessedTransaction>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ProcessedTransaction _item;
            final String _tmpTixraac;
            _tmpTixraac = _cursor.getString(_cursorIndexOfTixraac);
            final double _tmpAmountDollar;
            _tmpAmountDollar = _cursor.getDouble(_cursorIndexOfAmountDollar);
            final String _tmpSmsBody;
            _tmpSmsBody = _cursor.getString(_cursorIndexOfSmsBody);
            final long _tmpProcessedAt;
            _tmpProcessedAt = _cursor.getLong(_cursorIndexOfProcessedAt);
            final String _tmpUssdResult;
            _tmpUssdResult = _cursor.getString(_cursorIndexOfUssdResult);
            _item = new ProcessedTransaction(_tmpTixraac,_tmpAmountDollar,_tmpSmsBody,_tmpProcessedAt,_tmpUssdResult);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @NonNull
  public static List<Class<?>> getRequiredConverters() {
    return Collections.emptyList();
  }
}
