package com.shube.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class ShubeApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Initialize stuff here if needed
    }
}
